import { Job } from 'bull';
import { dataCollectionQueue } from '../config/queue';
import config from '../config/app';
import logger from '../utils/logger';
import stockDataService from '../services/stockData.service';
import technicalIndicatorsService from '../services/technicalIndicators.service';

interface DataCollectionJobData {
  type: 'all' | 'single';
  ticker?: string;
}

/**
 * Process data collection jobs
 */
dataCollectionQueue.process(async (job: Job<DataCollectionJobData>) => {
  const { type, ticker } = job.data;

  logger.info(`Processing data collection job: ${type}${ticker ? ` for ${ticker}` : ''}`);

  try {
    if (type === 'single' && ticker) {
      // Collect data for single stock
      const stockResult = await stockDataService.collectStockData(ticker);

      if (stockResult.success) {
        // Calculate technical indicators
        const indicatorResult = await technicalIndicatorsService.calculateAndSaveIndicators(ticker);

        return {
          success: true,
          ticker,
          stockDataSaved: stockResult.savedCount,
          indicatorsSaved: indicatorResult.savedCount,
        };
      } else {
        return {
          success: false,
          ticker,
          error: stockResult.error,
        };
      }
    } else {
      // Collect data for all tracked stocks
      const stockResults = await stockDataService.collectAllTrackedStocks();

      // Calculate technical indicators for all
      const indicatorResults = await technicalIndicatorsService.calculateAllTrackedIndicators();

      return {
        success: true,
        type: 'all',
        stockResults,
        indicatorResults,
      };
    }
  } catch (error: any) {
    logger.error('Error in data collection job:', error);
    throw error;
  }
});

/**
 * Schedule recurring data collection job
 */
export function scheduleDataCollection() {
  // Schedule daily price collection (after market close - 4 PM Oslo time on weekdays)
  dataCollectionQueue.add(
    { type: 'all' },
    {
      repeat: {
        cron: config.schedules.priceCollection, // '0 16 * * 1-5'
      },
      jobId: 'daily-price-collection',
    }
  );

  logger.info('Scheduled daily price collection job');
}

/**
 * Manually trigger data collection for all stocks
 */
export async function triggerDataCollection(ticker?: string) {
  const job = await dataCollectionQueue.add({
    type: ticker ? 'single' : 'all',
    ticker,
  });

  logger.info(`Triggered data collection job: ${job.id}`);
  return job;
}

export default {
  scheduleDataCollection,
  triggerDataCollection,
};
