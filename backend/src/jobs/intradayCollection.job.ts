import { Job } from 'bull';
import { intradayQueue } from '../config/queue';
import config from '../config/app';
import logger from '../utils/logger';
import stockDataService from '../services/stockData.service';
import cacheService from '../services/cache.service';

interface IntradayJobData {
  type: 'intraday';
  force?: boolean; // Skip market hours check if true
}

/**
 * Process intraday data collection jobs
 * Runs every 2 minutes during trading hours
 */
intradayQueue.process(async (job: Job<IntradayJobData>) => {
  logger.info('Processing intraday collection job');

  try {
    // Check if market is open (unless forced)
    if (!job.data.force && !stockDataService.isMarketOpen()) {
      logger.info('Market closed, skipping intraday collection');
      return {
        success: true,
        skipped: true,
        reason: 'market_closed',
        timestamp: new Date().toISOString(),
      };
    }

    // Collect latest prices for target stocks
    const result = await stockDataService.collectIntradayData();

    // Invalidate Redis cache if new data was fetched
    if (result.dataFetched) {
      await cacheService.clear('live:*');
      logger.info('Cache invalidated after intraday data collection');
    }

    return {
      success: result.success,
      skipped: false,
      dataFetched: result.dataFetched,
      lastFetchTime: result.lastFetchTime.toISOString(),
      results: result.results,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    logger.error('Error in intraday collection job:', error.message);
    return {
      success: false,
      skipped: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
});

/**
 * Schedule intraday collection job
 * Runs every 2 minutes during potential trading hours (9 AM - 4 PM CET)
 * Job itself checks if market is actually open
 */
export function scheduleIntradayCollection() {
  intradayQueue.add(
    { type: 'intraday' },
    {
      repeat: {
        cron: config.schedules.intradayCollection,
      },
      jobId: 'intraday-price-collection',
    }
  );

  logger.info(`Intraday collection scheduled: ${config.schedules.intradayCollection}`);
}

// Job event handlers
intradayQueue.on('completed', (job, result) => {
  if (result.skipped) {
    logger.debug(`Intraday job skipped: ${result.reason}`);
  } else if (result.success && result.dataFetched) {
    const successCount = result.results?.filter((r: any) => r.success).length || 0;
    logger.info(`Intraday collection completed: ${successCount}/${result.results?.length || 0} successful`);
  }
});

intradayQueue.on('failed', (job, err) => {
  logger.error('Intraday collection job failed:', err.message);
});

intradayQueue.on('error', (error) => {
  logger.error('Intraday queue error:', error);
});
