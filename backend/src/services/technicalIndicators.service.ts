import prisma from '../config/database';
import logger from '../utils/logger';
import TechnicalIndicators from '../utils/technicalIndicators';

/**
 * Service for calculating and storing technical indicators
 */
class TechnicalIndicatorsService {
  /**
   * Calculate and save technical indicators for a company
   */
  async calculateAndSaveIndicators(ticker: string): Promise<{
    success: boolean;
    savedCount: number;
    error?: string;
  }> {
    try {
      logger.info(`Calculating technical indicators for ${ticker}`);

      // Find company
      const company = await prisma.company.findUnique({
        where: { ticker },
        include: {
          stockPrices: {
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!company) {
        throw new Error(`Company ${ticker} not found`);
      }

      if (company.stockPrices.length < 200) {
        logger.warn(`Insufficient price data for ${ticker}: ${company.stockPrices.length} days`);
      }

      // Prepare price data
      const priceData = company.stockPrices.map(price => ({
        date: new Date(price.date),
        open: Number(price.open),
        high: Number(price.high),
        low: Number(price.low),
        close: Number(price.close),
        volume: Number(price.volume),
      }));

      // Calculate all indicators
      const indicators = TechnicalIndicators.calculateAllIndicators(priceData);

      // Save to database
      let savedCount = 0;
      for (const indicator of indicators) {
        // Only save if we have at least some indicators calculated
        if (indicator.rsi14 !== undefined || indicator.sma20 !== undefined) {
          try {
            await prisma.technicalIndicator.upsert({
              where: {
                companyId_date: {
                  companyId: company.id,
                  date: indicator.date,
                },
              },
              update: {
                rsi14: indicator.rsi14,
                macd: indicator.macd,
                macdSignal: indicator.macdSignal,
                macdHistogram: indicator.macdHistogram,
                sma20: indicator.sma20,
                sma50: indicator.sma50,
                sma200: indicator.sma200,
                ema12: indicator.ema12,
                ema26: indicator.ema26,
                bollingerUpper: indicator.bollingerUpper,
                bollingerMiddle: indicator.bollingerMiddle,
                bollingerLower: indicator.bollingerLower,
                stochasticK: indicator.stochasticK,
                stochasticD: indicator.stochasticD,
                atr14: indicator.atr14,
                adx14: indicator.adx14,
              },
              create: {
                companyId: company.id,
                date: indicator.date,
                rsi14: indicator.rsi14,
                macd: indicator.macd,
                macdSignal: indicator.macdSignal,
                macdHistogram: indicator.macdHistogram,
                sma20: indicator.sma20,
                sma50: indicator.sma50,
                sma200: indicator.sma200,
                ema12: indicator.ema12,
                ema26: indicator.ema26,
                bollingerUpper: indicator.bollingerUpper,
                bollingerMiddle: indicator.bollingerMiddle,
                bollingerLower: indicator.bollingerLower,
                stochasticK: indicator.stochasticK,
                stochasticD: indicator.stochasticD,
                atr14: indicator.atr14,
                adx14: indicator.adx14,
              },
            });
            savedCount++;
          } catch (error: any) {
            logger.error(`Error saving indicator for ${ticker} on ${indicator.date}:`, error.message);
          }
        }
      }

      logger.info(`Saved ${savedCount} technical indicators for ${ticker}`);

      return {
        success: true,
        savedCount,
      };
    } catch (error: any) {
      logger.error(`Error calculating indicators for ${ticker}:`, error.message);
      return {
        success: false,
        savedCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Calculate indicators for all tracked companies
   */
  async calculateAllTrackedIndicators(): Promise<{
    total: number;
    successful: number;
    failed: number;
    details: Array<{ ticker: string; savedCount: number; success: boolean; error?: string }>;
  }> {
    const companies = await prisma.company.findMany({
      where: { isTracked: true },
    });

    logger.info(`Calculating indicators for ${companies.length} companies`);

    const results = [];
    let successful = 0;
    let failed = 0;

    for (const company of companies) {
      const result = await this.calculateAndSaveIndicators(company.ticker);

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
    }

    logger.info(`Indicator calculation complete: ${successful} successful, ${failed} failed`);

    return {
      total: companies.length,
      successful,
      failed,
      details: results,
    };
  }
}

export default new TechnicalIndicatorsService();
