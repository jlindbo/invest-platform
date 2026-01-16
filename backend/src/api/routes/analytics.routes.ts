import { Router, Request, Response } from 'express';
import { predictionValidationJob } from '../../jobs/predictionValidation.job';
import { modelRetrainingJob } from '../../jobs/modelRetraining.job';
import { tradingSimulatorService } from '../../services/tradingSimulator.service';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /api/v1/analytics/accuracy
 * Get prediction accuracy statistics
 */
router.get('/accuracy', async (req: Request, res: Response) => {
  try {
    const stats = await predictionValidationJob.getAccuracyStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error('Error getting accuracy stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accuracy statistics',
    });
  }
});

/**
 * POST /api/v1/analytics/validate-predictions
 * Manually trigger prediction validation
 */
router.post('/validate-predictions', async (req: Request, res: Response) => {
  try {
    const result = await predictionValidationJob.validatePredictions();

    res.json({
      success: true,
      message: 'Prediction validation completed',
      result,
    });
  } catch (error: any) {
    logger.error('Error validating predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate predictions',
    });
  }
});

/**
 * POST /api/v1/analytics/retrain-models
 * Manually trigger model retraining check
 */
router.post('/retrain-models', async (req: Request, res: Response) => {
  try {
    const { force } = req.body;

    let result;
    if (force) {
      result = await modelRetrainingJob.retrainAllModels();
    } else {
      result = await modelRetrainingJob.checkAndRetrainModels();
    }

    res.json({
      success: true,
      message: force ? 'Force retraining completed' : 'Retraining check completed',
      result,
    });
  } catch (error: any) {
    logger.error('Error retraining models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrain models',
    });
  }
});

/**
 * GET /api/v1/analytics/trading-simulation
 * Run trading simulation based on historical predictions
 */
router.get('/trading-simulation', async (req: Request, res: Response) => {
  try {
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : 0.55;
    const positionSize = req.query.positionSize
      ? parseFloat(req.query.positionSize as string)
      : 10000;

    const result = await tradingSimulatorService.simulateHistoricalTrading({
      minConfidence,
      positionSize,
      maxPositionsPerStock: 1,
    });

    res.json({
      success: true,
      simulation: result,
    });
  } catch (error: any) {
    logger.error('Error running trading simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run trading simulation',
    });
  }
});

/**
 * GET /api/v1/analytics/trading-recommendations
 * Get current trading recommendations based on active predictions
 */
router.get('/trading-recommendations', async (req: Request, res: Response) => {
  try {
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : 0.60;

    const recommendations = await tradingSimulatorService.getTradingRecommendations(
      minConfidence
    );

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error: any) {
    logger.error('Error getting trading recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trading recommendations',
    });
  }
});

export default router;
