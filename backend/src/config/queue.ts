import Queue from 'bull';
import config from './app';
import logger from '../utils/logger';

// Create Bull queues for different job types
export const dataCollectionQueue = new Queue('data-collection', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
  },
});

export const newsScrapingQueue = new Queue('news-scraping', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
  },
});

export const predictionQueue = new Queue('predictions', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
  },
});

export const opportunityQueue = new Queue('opportunities', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
  },
});

export const intradayQueue = new Queue('intraday-collection', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
  },
});

// Queue event listeners
[dataCollectionQueue, newsScrapingQueue, predictionQueue, opportunityQueue, intradayQueue].forEach(queue => {
  queue.on('completed', (job) => {
    logger.info(`Job ${job.id} in queue ${queue.name} completed`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} in queue ${queue.name} failed:`, err.message);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} in queue ${queue.name} stalled`);
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Closing Bull queues...');
  await Promise.all([
    dataCollectionQueue.close(),
    newsScrapingQueue.close(),
    predictionQueue.close(),
    opportunityQueue.close(),
    intradayQueue.close(),
  ]);
  logger.info('Bull queues closed');
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default {
  dataCollectionQueue,
  newsScrapingQueue,
  predictionQueue,
  opportunityQueue,
  intradayQueue,
};
