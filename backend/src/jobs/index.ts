import logger from '../utils/logger';
import { scheduleDataCollection } from './dataCollection.job';
import { scheduleIntradayCollection } from './intradayCollection.job';
import { scheduleNewsScraping } from './newsScraping.job';
import { schedulePredictionGeneration } from './prediction.job';
import { predictionValidationJob } from './predictionValidation.job';
import { modelRetrainingJob } from './modelRetraining.job';
import { dataCollectionQueue } from '../config/queue';

/**
 * Schedule prediction validation (runs daily at 7 AM to validate yesterday's predictions)
 */
export function schedulePredictionValidation() {
  const schedule = '0 7 * * *'; // 7 AM daily

  dataCollectionQueue.add(
    'prediction-validation',
    { type: 'validation' },
    {
      repeat: {
        cron: schedule,
      },
      jobId: 'prediction-validation-daily',
    }
  );

  logger.info('Scheduled prediction validation job (7 AM daily)');
}

/**
 * Schedule model retraining check (runs weekly on Sundays at 2 AM)
 */
export function scheduleModelRetraining() {
  const schedule = '0 2 * * 0'; // 2 AM every Sunday

  dataCollectionQueue.add(
    'model-retraining',
    { type: 'retraining' },
    {
      repeat: {
        cron: schedule,
      },
      jobId: 'model-retraining-weekly',
    }
  );

  logger.info('Scheduled model retraining job (2 AM every Sunday)');
}

/**
 * Initialize all scheduled background jobs
 */
export function initializeJobs() {
  logger.info('Initializing background jobs...');

  // Schedule data collection (daily after market close)
  scheduleDataCollection();

  // Schedule intraday collection (every 2 minutes during trading hours)
  scheduleIntradayCollection();

  // Schedule news scraping (every 2 hours)
  scheduleNewsScraping();

  // Schedule prediction generation (daily at 6 AM)
  schedulePredictionGeneration();

  // Schedule prediction validation (daily at 7 AM)
  schedulePredictionValidation();

  // Schedule model retraining (weekly on Sundays)
  scheduleModelRetraining();

  // Process validation jobs
  dataCollectionQueue.process('prediction-validation', async (job) => {
    logger.info('Processing prediction validation job');
    const result = await predictionValidationJob.validatePredictions();
    logger.info(`Validation complete: ${result.validated} validated, ${result.correct} correct`);
    return result;
  });

  // Process retraining jobs
  dataCollectionQueue.process('model-retraining', async (job) => {
    logger.info('Processing model retraining job');
    const result = await modelRetrainingJob.checkAndRetrainModels();
    logger.info(`Retraining check complete: ${result.modelsRetrained} models retrained`);
    return result;
  });

  logger.info('✅ All background jobs initialized');
}

export default {
  initializeJobs,
};
