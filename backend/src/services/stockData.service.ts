import axios from 'axios';
import { subDays, format, isWithinInterval, setHours, setMinutes, getDay, addDays } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import logger from '../utils/logger';
import prisma from '../config/database';
import config from '../config/app';
import cacheService from './cache.service';

interface YahooFinanceQuote {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number;
}

interface StockDataResult {
  ticker: string;
  quotes: YahooFinanceQuote[];
  success: boolean;
  error?: string;
}

/**
 * Service for collecting stock price data from Yahoo Finance
 * Oslo Børs stocks use the .OL suffix (e.g., VAR.OL, DNB.OL)
 */
class StockDataService {
  private readonly baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  /**
   * Fetch historical stock data from Yahoo Finance
   */
  async fetchHistoricalData(
    ticker: string,
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<StockDataResult> {
    try {
      logger.info(`Fetching historical data for ${ticker}`);

      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);

      const url = `${this.baseUrl}/${ticker}`;
      const params = {
        period1,
        period2,
        interval: '1d',
        events: 'history',
      };

      const response = await axios.get(url, {
        params,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 30000,
      });

      if (!response.data?.chart?.result?.[0]) {
        throw new Error('Invalid response from Yahoo Finance');
      }

      const result = response.data.chart.result[0];
      const timestamps = result.timestamp || [];
      const quote = result.indicators.quote[0];
      const adjclose = result.indicators.adjclose?.[0]?.adjclose || [];

      const quotes: YahooFinanceQuote[] = timestamps.map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000),
        open: quote.open[index],
        high: quote.high[index],
        low: quote.low[index],
        close: quote.close[index],
        volume: quote.volume[index],
        adjClose: adjclose[index] || quote.close[index],
      })).filter((q: YahooFinanceQuote) =>
        q.open !== null && q.high !== null && q.low !== null && q.close !== null
      );

      logger.info(`Successfully fetched ${quotes.length} quotes for ${ticker}`);

      return {
        ticker,
        quotes,
        success: true,
      };
    } catch (error: any) {
      logger.error(`Error fetching data for ${ticker}:`, error.message);
      return {
        ticker,
        quotes: [],
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save stock price data to database
   */
  async saveStockPrices(companyId: number, quotes: YahooFinanceQuote[]): Promise<number> {
    let savedCount = 0;

    for (const quote of quotes) {
      try {
        await prisma.stockPrice.upsert({
          where: {
            companyId_date: {
              companyId,
              date: quote.date,
            },
          },
          update: {
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            volume: quote.volume,
            adjustedClose: quote.adjClose,
          },
          create: {
            companyId,
            date: quote.date,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            volume: quote.volume,
            adjustedClose: quote.adjClose,
          },
        });
        savedCount++;
      } catch (error: any) {
        logger.error(`Error saving quote for date ${quote.date}:`, error.message);
      }
    }

    return savedCount;
  }

  /**
   * Collect and store stock data for a company
   */
  async collectStockData(ticker: string, daysBack: number = 730): Promise<{
    success: boolean;
    savedCount: number;
    error?: string;
  }> {
    try {
      // Find company in database
      const company = await prisma.company.findUnique({
        where: { ticker },
      });

      if (!company) {
        throw new Error(`Company with ticker ${ticker} not found`);
      }

      // Check if we already have recent data
      const latestPrice = await prisma.stockPrice.findFirst({
        where: { companyId: company.id },
        orderBy: { date: 'desc' },
      });

      // If we have recent data, only fetch from last date
      let startDate: Date;
      if (latestPrice) {
        startDate = new Date(latestPrice.date);
        startDate.setDate(startDate.getDate() + 1); // Start from next day
        logger.info(`Last data for ${ticker}: ${format(latestPrice.date, 'yyyy-MM-dd')}`);
      } else {
        startDate = subDays(new Date(), daysBack);
        logger.info(`No existing data for ${ticker}, fetching ${daysBack} days`);
      }

      // Fetch data from Yahoo Finance
      const result = await this.fetchHistoricalData(ticker, startDate);

      if (!result.success || result.quotes.length === 0) {
        return {
          success: false,
          savedCount: 0,
          error: result.error || 'No data received',
        };
      }

      // Save to database
      const savedCount = await this.saveStockPrices(company.id, result.quotes);

      logger.info(`Saved ${savedCount} quotes for ${ticker}`);

      return {
        success: true,
        savedCount,
      };
    } catch (error: any) {
      logger.error(`Error collecting stock data for ${ticker}:`, error.message);
      return {
        success: false,
        savedCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Collect data for all tracked companies
   */
  async collectAllTrackedStocks(): Promise<{
    total: number;
    successful: number;
    failed: number;
    details: Array<{ ticker: string; savedCount: number; success: boolean; error?: string }>;
  }> {
    const companies = await prisma.company.findMany({
      where: { isTracked: true },
    });

    logger.info(`Collecting data for ${companies.length} tracked companies`);

    const results = [];
    let successful = 0;
    let failed = 0;

    for (const company of companies) {
      const result = await this.collectStockData(company.ticker);

      results.push({
        ticker: company.ticker,
        savedCount: result.savedCount,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info(`Collection complete: ${successful} successful, ${failed} failed`);

    return {
      total: companies.length,
      successful,
      failed,
      details: results,
    };
  }

  /**
   * Get latest price for a ticker
   */
  async getLatestPrice(ticker: string): Promise<YahooFinanceQuote | null> {
    try {
      const result = await this.fetchHistoricalData(
        ticker,
        subDays(new Date(), 7), // Last 7 days
        new Date()
      );

      if (result.success && result.quotes.length > 0) {
        return result.quotes[result.quotes.length - 1];
      }

      return null;
    } catch (error: any) {
      logger.error(`Error getting latest price for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Check if Oslo Børs is currently open for trading
   * Trading hours: 9:00 AM - 4:20 PM CET, Monday-Friday
   * Excludes Norwegian market holidays
   */
  isMarketOpen(): boolean {
    try {
      // Get current time in Oslo timezone
      const now = toZonedTime(new Date(), config.market.timezone);

      // Check if it's a weekday (Monday-Friday)
      const dayOfWeek = getDay(now);
      if (!config.market.tradingDays.includes(dayOfWeek)) {
        return false; // Weekend
      }

      // Check if it's a market holiday
      const dateStr = format(now, 'yyyy-MM-dd');
      if (config.market.holidays.includes(dateStr)) {
        return false;
      }

      // Check if within trading hours (9:00 - 16:20)
      const marketOpen = setMinutes(setHours(now, config.market.tradingHours.open.hour), config.market.tradingHours.open.minute);
      const marketClose = setMinutes(setHours(now, config.market.tradingHours.close.hour), config.market.tradingHours.close.minute);

      return isWithinInterval(now, { start: marketOpen, end: marketClose });
    } catch (error: any) {
      logger.error('Error checking market hours:', error.message);
      return false;
    }
  }

  /**
   * Get the next market open time
   * Used by frontend to show "Next update: ..." message
   */
  getNextMarketOpen(): Date {
    try {
      const now = toZonedTime(new Date(), config.market.timezone);

      // If currently in trading hours, return current time
      if (this.isMarketOpen()) {
        return now;
      }

      // Otherwise, find next weekday at 9:00 AM
      let nextOpen = setMinutes(setHours(now, config.market.tradingHours.open.hour), config.market.tradingHours.open.minute);

      // If past market close today, move to tomorrow
      const marketClose = setMinutes(setHours(now, config.market.tradingHours.close.hour), config.market.tradingHours.close.minute);
      if (now > marketClose) {
        nextOpen = addDays(nextOpen, 1);
      }

      // Skip weekends and holidays
      while (!config.market.tradingDays.includes(getDay(nextOpen)) ||
             config.market.holidays.includes(format(nextOpen, 'yyyy-MM-dd'))) {
        nextOpen = addDays(nextOpen, 1);
      }

      return fromZonedTime(nextOpen, config.market.timezone);
    } catch (error: any) {
      logger.error('Error calculating next market open:', error.message);
      return addDays(new Date(), 1); // Fallback to tomorrow
    }
  }

  /**
   * Fetch latest intraday prices for multiple tickers
   * Uses smaller date range (last 3 days) for faster response
   */
  async fetchIntradayPrices(tickers: string[]): Promise<Map<string, YahooFinanceQuote>> {
    const priceMap = new Map<string, YahooFinanceQuote>();

    for (const ticker of tickers) {
      try {
        const result = await this.fetchHistoricalData(
          ticker,
          subDays(new Date(), 3), // Last 3 days
          new Date()
        );

        if (result.success && result.quotes.length > 0) {
          // Get the most recent quote
          const latestQuote = result.quotes[result.quotes.length - 1];
          priceMap.set(ticker, latestQuote);
        }

        // Maintain 1-second delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        logger.error(`Error fetching intraday price for ${ticker}:`, error.message);
      }
    }

    return priceMap;
  }

  /**
   * Collect intraday data for target companies
   * Smart collection - only fetch if market is open and not recently cached
   */
  async collectIntradayData(): Promise<{
    success: boolean;
    dataFetched: boolean;
    lastFetchTime: Date;
    results: Array<{ticker: string; success: boolean; savedCount: number; error?: string}>;
  }> {
    try {
      const cacheKey = 'intraday:last-fetch:v1';

      // Check cache to avoid fetching too frequently
      const lastFetch = await cacheService.get<string>(cacheKey);
      if (lastFetch) {
        const lastFetchTime = new Date(lastFetch);
        const timeSinceLastFetch = Date.now() - lastFetchTime.getTime();

        // If fetched within last 2 minutes, skip
        if (timeSinceLastFetch < 120000) {
          logger.info('Intraday data recently fetched, using cache');
          return {
            success: true,
            dataFetched: false,
            lastFetchTime,
            results: [],
          };
        }
      }

      // Get target companies
      const companies = await prisma.company.findMany({
        where: { isTarget: true },
      });

      logger.info(`Collecting intraday data for ${companies.length} target companies`);

      const tickers = companies.map(c => c.ticker);
      const priceMap = await this.fetchIntradayPrices(tickers);

      const results = [];
      for (const company of companies) {
        const quote = priceMap.get(company.ticker);

        if (quote) {
          try {
            // Save to database
            await prisma.stockPrice.upsert({
              where: {
                companyId_date: {
                  companyId: company.id,
                  date: quote.date,
                },
              },
              update: {
                open: quote.open,
                high: quote.high,
                low: quote.low,
                close: quote.close,
                volume: quote.volume,
                adjustedClose: quote.adjClose,
              },
              create: {
                companyId: company.id,
                date: quote.date,
                open: quote.open,
                high: quote.high,
                low: quote.low,
                close: quote.close,
                volume: quote.volume,
                adjustedClose: quote.adjClose,
              },
            });

            results.push({
              ticker: company.ticker,
              success: true,
              savedCount: 1,
            });
          } catch (error: any) {
            logger.error(`Error saving intraday data for ${company.ticker}:`, error.message);
            results.push({
              ticker: company.ticker,
              success: false,
              savedCount: 0,
              error: error.message,
            });
          }
        } else {
          results.push({
            ticker: company.ticker,
            success: false,
            savedCount: 0,
            error: 'No quote received',
          });
        }
      }

      // Update cache with current timestamp
      const now = new Date();
      await cacheService.set(cacheKey, now.toISOString(), config.cache.intradayDataTtl);

      logger.info(`Intraday collection complete: ${results.filter(r => r.success).length}/${results.length} successful`);

      return {
        success: true,
        dataFetched: true,
        lastFetchTime: now,
        results,
      };
    } catch (error: any) {
      logger.error('Error collecting intraday data:', error.message);
      return {
        success: false,
        dataFetched: false,
        lastFetchTime: new Date(),
        results: [],
      };
    }
  }
}

export default new StockDataService();
