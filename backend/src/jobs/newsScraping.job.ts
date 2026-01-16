import { Job } from 'bull';
import { newsScrapingQueue } from '../config/queue';
import config from '../config/app';
import logger from '../utils/logger';
import { e24RSScraper, dnRSScraper } from '../scrapers/rss/RSSFeedScraper';
import { cisionScraper } from '../scrapers/rss/CisionScraper';
import companyDetectionService from '../services/companyDetection.service';

interface NewsScrapingJobData {
  sources?: string[]; // Specific sources to scrape, or all if not specified
}

/**
 * Process news scraping jobs
 */
newsScrapingQueue.process(async (job: Job<NewsScrapingJobData>) => {
  const { sources } = job.data;

  logger.info('Starting news scraping job');

  const results = [];

  try {
    // Determine which scrapers to run (RSS feeds + HTML scraping)
    const scrapersToRun = [];

    if (!sources || sources.includes('E24.no')) {
      scrapersToRun.push({ name: 'E24.no', scraper: e24RSScraper });
    }

    if (!sources || sources.includes('Dagens Næringsliv')) {
      scrapersToRun.push({ name: 'Dagens Næringsliv', scraper: dnRSScraper });
    }

    if (!sources || sources.includes('Cision Norge')) {
      scrapersToRun.push({ name: 'Cision Norge', scraper: cisionScraper });
    }

    // Run RSS scrapers
    for (const { name, scraper } of scrapersToRun) {
      try {
        logger.info(`Running RSS scraper: ${name}`);
        const result = await scraper.scrape();
        results.push({
          source: name,
          success: true,
          ...result,
        });
        logger.info(`${name}: Found ${result.articlesFound} articles, saved ${result.articlesSaved} new articles`);
      } catch (error: any) {
        logger.error(`RSS scraper ${name} failed:`, error);
        results.push({
          source: name,
          success: false,
          error: error.message,
          articlesFound: 0,
          articlesSaved: 0,
        });
      }
    }

    // Process company detection for newly scraped articles
    logger.info('Processing company detection for new articles');
    const detectionResult = await companyDetectionService.processUnlinkedArticles(50);

    logger.info('News scraping job completed');

    return {
      success: true,
      scrapingResults: results,
      companyDetection: detectionResult,
      totalArticlesSaved: results.reduce((sum, r) => sum + (r.articlesSaved || 0), 0),
    };
  } catch (error: any) {
    logger.error('News scraping job failed:', error);
    throw error;
  }
});

/**
 * Schedule recurring news scraping job
 */
export function scheduleNewsScraping() {
  // Schedule news scraping every 2 hours
  newsScrapingQueue.add(
    {},
    {
      repeat: {
        cron: config.schedules.newsScraping, // '0 */2 * * *'
      },
      jobId: 'recurring-news-scraping',
    }
  );

  logger.info('Scheduled recurring news scraping job');
}

/**
 * Manually trigger news scraping
 */
export async function triggerNewsScraping(sources?: string[]) {
  const job = await newsScrapingQueue.add({ sources });

  logger.info(`Triggered news scraping job: ${job.id}`);
  return job;
}

export default {
  scheduleNewsScraping,
  triggerNewsScraping,
};
