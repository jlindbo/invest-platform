import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import cacheService from '../../services/cache.service';
import stockDataService from '../../services/stockData.service';
import config from '../../config/app';

const router = Router();

/**
 * GET /api/v1/live/comparison
 * Get live price comparison with latest predictions
 * Includes Redis caching (5-min TTL), enhanced error indicators, and price history
 */
router.get('/comparison', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'live:comparison:v1';

    // Try cache first
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      logger.info('Serving live comparison from cache');
      return res.json({
        ...cached,
        fromCache: true,
        cacheTimestamp: cached.lastUpdated,
      });
    }

    // Fetch from database
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 7, // Get last 7 days for sparkline + comparison
        },
      },
    });

    const comparisons = await Promise.all(
      companies.map(async (company) => {
        // Get latest prediction
        const prediction = await prisma.prediction.findFirst({
          where: { companyId: company.id },
          orderBy: { id: 'desc' },
          include: {
            model: {
              select: { version: true },
            },
          },
        });

        if (!prediction || company.stockPrices.length === 0) {
          return null;
        }

        const latestPrice = company.stockPrices[0];
        const previousPrice = company.stockPrices[1];

        // Calculate actual change
        const actualPrice = Number(latestPrice.close);
        const previousActualPrice = previousPrice ? Number(previousPrice.close) : null;

        const actualChange = previousActualPrice
          ? ((actualPrice - previousActualPrice) / previousActualPrice) * 100
          : null;

        const actualDirection = actualChange !== null
          ? (actualChange > 0 ? 'up' : 'down')
          : null;

        // Calculate prediction error
        const predictedPrice = prediction.predictedPrice ? Number(prediction.predictedPrice) : null;
        const predictedChange = prediction.predictedChangePercent ? Number(prediction.predictedChangePercent) : null;

        const priceError = predictedPrice
          ? Math.abs((actualPrice - predictedPrice) / actualPrice) * 100
          : null;

        const changeError = predictedChange !== null && actualChange !== null
          ? predictedChange - actualChange
          : null;

        const directionCorrect = actualDirection && prediction.predictedDirection
          ? actualDirection === prediction.predictedDirection
          : null;

        // Enhanced: Error category and badge
        const errorCategory = priceError !== null
          ? priceError < 2 ? 'excellent'
          : priceError < 5 ? 'good'
          : 'poor'
          : null;

        const errorBadge = {
          color: priceError !== null
            ? priceError < 2 ? 'green'
            : priceError < 5 ? 'yellow'
            : 'red'
            : 'gray',
          label: priceError !== null
            ? `${priceError.toFixed(1)}% error`
            : 'N/A',
        };

        // Enhanced: Price history for sparkline (last 5 data points)
        const priceHistory = company.stockPrices
          .slice(0, 5)
          .reverse() // Oldest to newest
          .map(sp => ({
            date: sp.date.toISOString(),
            close: Number(sp.close),
          }));

        return {
          ticker: company.ticker,
          companyName: company.name,

          // Current/Live data
          currentPrice: actualPrice,
          currentDate: latestPrice.date,
          currentChange: actualChange,
          currentDirection: actualDirection,

          // Prediction data
          predictedPrice,
          predictedChange,
          predictedDirection: prediction.predictedDirection,
          predictionDate: prediction.predictionDate,
          targetDate: prediction.targetDate,
          confidence: prediction.confidence ? Number(prediction.confidence) : null,

          // Accuracy metrics
          priceError, // Absolute percentage error in price prediction
          changeError, // Percentage point error in change prediction
          directionCorrect,

          // Enhanced fields
          errorCategory,
          errorBadge,
          priceHistory,

          // Metadata
          modelVersion: prediction.model?.version,
          lastUpdated: new Date().toISOString(),
        };
      })
    );

    const validComparisons = comparisons.filter(c => c !== null);

    const response = {
      success: true,
      count: validComparisons.length,
      comparisons: validComparisons,
      lastUpdated: new Date().toISOString(),
      marketOpen: stockDataService.isMarketOpen(),
      nextUpdate: stockDataService.getNextMarketOpen().toISOString(),
      fromCache: false,
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, response, config.cache.liveComparisonTtl);

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching live comparison:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live comparison',
    });
  }
});

/**
 * GET /api/v1/live/prices
 * Get current live prices for all target stocks
 */
router.get('/prices', async (req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 2,
        },
      },
    });

    const prices = companies.map(company => {
      const latest = company.stockPrices[0];
      const previous = company.stockPrices[1];

      if (!latest) return null;

      const currentPrice = Number(latest.close);
      const previousPrice = previous ? Number(previous.close) : null;
      const change = previousPrice
        ? ((currentPrice - previousPrice) / previousPrice) * 100
        : null;

      return {
        ticker: company.ticker,
        name: company.name,
        price: currentPrice,
        change,
        direction: change !== null ? (change > 0 ? 'up' : 'down') : null,
        volume: Number(latest.volume),
        date: latest.date,
        high: Number(latest.high),
        low: Number(latest.low),
      };
    }).filter(p => p !== null);

    res.json({
      success: true,
      count: prices.length,
      prices,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching live prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live prices',
    });
  }
});

export default router;
