import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import mlClientService from '../../services/mlClient.service';
import { triggerPredictionGeneration } from '../../jobs/prediction.job';

const router = Router();

/**
 * GET /api/v1/predictions/latest
 * Get latest predictions for all target stocks
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    // Get latest prediction for each target company
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      select: { id: true },
    });

    const predictions = await Promise.all(
      companies.map(async (company) => {
        return await prisma.prediction.findFirst({
          where: { companyId: company.id },
          orderBy: { id: 'desc' }, // Use ID to get the most recent
          include: {
            company: true,
            model: {
              select: {
                version: true,
                validationAccuracy: true,
              },
            },
          },
        });
      })
    );

    // Filter out null predictions
    const validPredictions = predictions.filter(p => p !== null);

    res.json({
      success: true,
      count: validPredictions.length,
      predictions: validPredictions.map(p => ({
        id: p.id,
        ticker: p.company.ticker,
        companyName: p.company.name,
        predictionDate: p.predictionDate,
        targetDate: p.targetDate,
        predictedDirection: p.predictedDirection,
        confidence: p.confidence ? Number(p.confidence) : null,
        predictedPrice: p.predictedPrice ? Number(p.predictedPrice) : null,
        predictedChangePercent: p.predictedChangePercent ? Number(p.predictedChangePercent) : null,
        actualDirection: p.actualDirection,
        actualPrice: p.actualPrice ? Number(p.actualPrice) : null,
        isCorrect: p.isCorrect,
        modelVersion: p.model?.version,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching latest predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch predictions',
    });
  }
});

/**
 * GET /api/v1/predictions/:ticker
 * Get predictions for a specific stock
 */
router.get('/:ticker', async (req: Request, res: Response) => {
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

    const predictions = await prisma.prediction.findMany({
      where: { companyId: company.id },
      orderBy: { targetDate: 'desc' },
      skip: Number(offset),
      take: Number(limit),
      include: {
        model: {
          select: {
            version: true,
            validationAccuracy: true,
          },
        },
      },
    });

    // Calculate accuracy stats
    const total = predictions.filter(p => p.isCorrect !== null).length;
    const correct = predictions.filter(p => p.isCorrect === true).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    res.json({
      success: true,
      ticker,
      companyName: company.name,
      count: predictions.length,
      accuracy: accuracy.toFixed(2),
      predictions: predictions.map(p => ({
        id: p.id,
        predictionDate: p.predictionDate,
        targetDate: p.targetDate,
        predictedDirection: p.predictedDirection,
        confidence: p.confidence ? Number(p.confidence) : null,
        predictedPrice: p.predictedPrice ? Number(p.predictedPrice) : null,
        predictedChangePercent: p.predictedChangePercent ? Number(p.predictedChangePercent) : null,
        actualDirection: p.actualDirection,
        actualPrice: p.actualPrice ? Number(p.actualPrice) : null,
        actualChangePercent: p.actualChangePercent ? Number(p.actualChangePercent) : null,
        isCorrect: p.isCorrect,
        modelVersion: p.model?.version,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch predictions',
    });
  }
});

/**
 * GET /api/v1/predictions/:ticker/accuracy
 * Get prediction accuracy metrics for a stock
 */
router.get('/:ticker/accuracy', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { days = 30 } = req.query;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Number(days));

    const predictions = await prisma.prediction.findMany({
      where: {
        companyId: company.id,
        targetDate: {
          gte: cutoffDate,
        },
        isCorrect: {
          not: null,
        },
      },
    });

    const total = predictions.length;
    const correct = predictions.filter(p => p.isCorrect === true).length;
    const upPredictions = predictions.filter(p => p.predictedDirection === 'up');
    const downPredictions = predictions.filter(p => p.predictedDirection === 'down');

    const upCorrect = upPredictions.filter(p => p.isCorrect === true).length;
    const downCorrect = downPredictions.filter(p => p.isCorrect === true).length;

    res.json({
      success: true,
      ticker,
      period: `${days} days`,
      total,
      correct,
      incorrect: total - correct,
      accuracy: total > 0 ? ((correct / total) * 100).toFixed(2) : '0',
      upAccuracy: upPredictions.length > 0 ? ((upCorrect / upPredictions.length) * 100).toFixed(2) : '0',
      downAccuracy: downPredictions.length > 0 ? ((downCorrect / downPredictions.length) * 100).toFixed(2) : '0',
    });
  } catch (error: any) {
    logger.error('Error calculating accuracy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate accuracy',
    });
  }
});

/**
 * POST /api/v1/predictions/generate
 * Trigger prediction generation
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.body;

    const job = await triggerPredictionGeneration(ticker);

    res.json({
      success: true,
      message: ticker
        ? `Prediction generation triggered for ${ticker}`
        : 'Prediction generation triggered for all target stocks',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('Error triggering prediction generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger prediction generation',
    });
  }
});

/**
 * POST /api/v1/predictions/:ticker/train
 * Trigger model training for a stock
 */
router.post('/:ticker/train', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { epochs } = req.body;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    const result = await mlClientService.trainModel(ticker, epochs);

    if (result.success) {
      res.json({
        success: true,
        ticker,
        message: result.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Error triggering training:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger training',
    });
  }
});

export default router;
