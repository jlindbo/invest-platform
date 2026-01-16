import { Job } from 'bull';
import { predictionQueue } from '../config/queue';
import config from '../config/app';
import logger from '../utils/logger';
import prisma from '../config/database';
import mlClientService from '../services/mlClient.service';

interface PredictionJobData {
  type: 'all' | 'single';
  ticker?: string;
}

/**
 * Process prediction generation jobs
 */
predictionQueue.process(async (job: Job<PredictionJobData>) => {
  const { type, ticker } = job.data;

  logger.info(`Processing prediction job: ${type}${ticker ? ` for ${ticker}` : ''}`);

  try {
    if (type === 'single' && ticker) {
      // Generate prediction for single stock
      const result = await mlClientService.predictSingle(ticker);

      return {
        success: result.success,
        ticker,
        prediction: result,
      };
    } else {
      // Generate predictions for all target stocks
      const companies = await prisma.company.findMany({
        where: { isTarget: true },
        orderBy: { name: 'asc' },
      });

      logger.info(`Generating predictions for ${companies.length} target stocks`);

      const tickers = companies.map(c => c.ticker);
      const results = await mlClientService.predictBatch(tickers);

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      logger.info(`Prediction generation complete: ${successful} successful, ${failed} failed`);

      // Also update article sentiments while we're at it
      logger.info('Updating article sentiments...');
      const sentimentCount = await mlClientService.updateArticleSentiments(50);
      logger.info(`Updated sentiment for ${sentimentCount} articles`);

      return {
        success: true,
        type: 'all',
        total: results.length,
        successful,
        failed,
        sentimentsUpdated: sentimentCount,
        predictions: results,
      };
    }
  } catch (error: any) {
    logger.error('Prediction job failed:', error);
    throw error;
  }
});

/**
 * Schedule recurring prediction generation job
 */
export function schedulePredictionGeneration() {
  // Schedule prediction generation every 2 hours during trading hours (8 AM - 6 PM on weekdays)
  // This keeps predictions fresh with latest news and market data
  predictionQueue.add(
    { type: 'all' },
    {
      repeat: {
        cron: '0 8,10,12,14,16,18 * * 1-5', // Every 2 hours from 8 AM to 6 PM on weekdays
      },
      jobId: 'frequent-prediction-generation',
    }
  );

  logger.info('Scheduled prediction generation every 2 hours during trading hours (Mon-Fri 8AM-6PM)');
}

/**
 * Manually trigger prediction generation
 */
export async function triggerPredictionGeneration(ticker?: string) {
  const job = await predictionQueue.add({
    type: ticker ? 'single' : 'all',
    ticker,
  });

  logger.info(`Triggered prediction generation job: ${job.id}`);
  return job;
}

export default {
  schedulePredictionGeneration,
  triggerPredictionGeneration,
};
