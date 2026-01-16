import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import stockDataService from '../../services/stockData.service';
import { triggerDataCollection } from '../../jobs/dataCollection.job';

const router = Router();

/**
 * GET /api/v1/stocks
 * Get all tracked stocks
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isTracked: true },
      orderBy: { name: 'asc' },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 1, // Latest price
        },
      },
    });

    const stocks = companies.map(company => ({
      id: company.id,
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      isTarget: company.isTarget,
      latestPrice: company.stockPrices[0] ? {
        date: company.stockPrices[0].date,
        close: Number(company.stockPrices[0].close),
        volume: Number(company.stockPrices[0].volume),
      } : null,
    }));

    res.json({
      success: true,
      count: stocks.length,
      stocks,
    });
  } catch (error: any) {
    logger.error('Error fetching stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stocks',
    });
  }
});

/**
 * GET /api/v1/stocks/:ticker
 * Get specific stock details
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    const company = await prisma.company.findUnique({
      where: { ticker },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    res.json({
      success: true,
      stock: {
        id: company.id,
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        industry: company.industry,
        marketCap: company.marketCap,
        isTracked: company.isTracked,
        isTarget: company.isTarget,
        latestPrice: company.stockPrices[0] ? {
          date: company.stockPrices[0].date,
          open: Number(company.stockPrices[0].open),
          high: Number(company.stockPrices[0].high),
          low: Number(company.stockPrices[0].low),
          close: Number(company.stockPrices[0].close),
          volume: Number(company.stockPrices[0].volume),
        } : null,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock',
    });
  }
});

/**
 * GET /api/v1/stocks/:ticker/prices
 * Get historical prices for a stock
 */
router.get('/:ticker/prices', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { limit = 90, offset = 0 } = req.query;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    const prices = await prisma.stockPrice.findMany({
      where: { companyId: company.id },
      orderBy: { date: 'desc' },
      skip: Number(offset),
      take: Number(limit),
    });

    res.json({
      success: true,
      ticker,
      count: prices.length,
      prices: prices.map(p => ({
        date: p.date,
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume),
        adjustedClose: p.adjustedClose ? Number(p.adjustedClose) : null,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prices',
    });
  }
});

/**
 * GET /api/v1/stocks/:ticker/indicators
 * Get technical indicators for a stock
 */
router.get('/:ticker/indicators', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { limit = 30, offset = 0 } = req.query;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    const indicators = await prisma.technicalIndicator.findMany({
      where: { companyId: company.id },
      orderBy: { date: 'desc' },
      skip: Number(offset),
      take: Number(limit),
    });

    res.json({
      success: true,
      ticker,
      count: indicators.length,
      indicators: indicators.map(i => ({
        date: i.date,
        rsi14: i.rsi14 ? Number(i.rsi14) : null,
        macd: i.macd ? Number(i.macd) : null,
        macdSignal: i.macdSignal ? Number(i.macdSignal) : null,
        sma20: i.sma20 ? Number(i.sma20) : null,
        sma50: i.sma50 ? Number(i.sma50) : null,
        sma200: i.sma200 ? Number(i.sma200) : null,
        bollingerUpper: i.bollingerUpper ? Number(i.bollingerUpper) : null,
        bollingerMiddle: i.bollingerMiddle ? Number(i.bollingerMiddle) : null,
        bollingerLower: i.bollingerLower ? Number(i.bollingerLower) : null,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching indicators:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch indicators',
    });
  }
});

/**
 * POST /api/v1/stocks/:ticker/collect
 * Trigger data collection for a specific stock
 */
router.post('/:ticker/collect', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    const job = await triggerDataCollection(ticker);

    res.json({
      success: true,
      message: `Data collection triggered for ${ticker}`,
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('Error triggering data collection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger data collection',
    });
  }
});

export default router;
