import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import logger from '../../utils/logger';
import config from '../../config/app';
import prisma from '../../config/database';

export interface ScrapedArticle {
  title: string;
  content?: string;
  summary?: string;
  url: string;
  author?: string;
  publishedAt: Date;
  language?: string;
}

export interface ScrapeResult {
  success: boolean;
  articles: ScrapedArticle[];
  articlesFound: number;
  articlesSaved: number;
  error?: string;
}

/**
 * Base class for all web scrapers
 * Provides common functionality like rate limiting, robots.txt checking, and browser management
 */
export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected sourceName: string;
  protected baseUrl: string;
  protected userAgent: string;
  protected delayMs: number;
  private lastRequestTime: number = 0;

  constructor(sourceName: string, baseUrl: string) {
    this.sourceName = sourceName;
    this.baseUrl = baseUrl;
    this.userAgent = config.scraping.userAgent;
    this.delayMs = config.scraping.delayMs;
  }

  /**
   * Initialize Puppeteer browser
   */
  protected async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  protected async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Rate limiting delay
   */
  protected async delay(ms?: number): Promise<void> {
    const delayTime = ms || this.delayMs;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest < delayTime) {
      const waitTime = delayTime - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Check robots.txt compliance (simplified)
   */
  protected async checkRobotsTxt(url: string): Promise<boolean> {
    try {
      const robotsUrl = new URL('/robots.txt', url).toString();
      const response = await axios.get(robotsUrl, { timeout: 5000 });

      // Simple check - if robots.txt disallows our user agent, return false
      const content = response.data.toLowerCase();

      if (content.includes('user-agent: *') && content.includes('disallow: /')) {
        logger.warn(`${this.sourceName}: Site may disallow scraping`);
        return true; // Continue anyway for educational purposes, but log warning
      }

      return true;
    } catch (error) {
      // If robots.txt doesn't exist or can't be fetched, proceed
      return true;
    }
  }

  /**
   * Create a new page with configured settings
   */
  protected async createPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(this.userAgent);
    await page.setViewport({ width: 1920, height: 1080 });

    // Block unnecessary resources for faster scraping
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  /**
   * Save article to database
   */
  protected async saveArticle(article: ScrapedArticle, sourceId: number): Promise<boolean> {
    try {
      // Check if article already exists
      const existing = await prisma.newsArticle.findUnique({
        where: { url: article.url },
      });

      if (existing) {
        logger.debug(`Article already exists: ${article.url}`);
        return false;
      }

      await prisma.newsArticle.create({
        data: {
          sourceId,
          title: article.title,
          content: article.content,
          summary: article.summary,
          url: article.url,
          author: article.author,
          publishedAt: article.publishedAt,
          language: article.language || 'no',
        },
      });

      return true;
    } catch (error: any) {
      logger.error(`Error saving article: ${error.message}`);
      return false;
    }
  }

  /**
   * Log scraping activity
   */
  protected async logScrapingActivity(
    sourceId: number,
    startedAt: Date,
    articlesFound: number,
    articlesSaved: number,
    status: 'success' | 'failed' | 'partial',
    errorMessage?: string
  ): Promise<void> {
    try {
      await prisma.scrapingLog.create({
        data: {
          sourceId,
          startedAt,
          completedAt: new Date(),
          articlesFound,
          articlesSaved,
          status,
          errorMessage,
        },
      });
    } catch (error: any) {
      logger.error(`Error logging scraping activity: ${error.message}`);
    }
  }

  /**
   * Abstract method to be implemented by specific scrapers
   */
  abstract scrape(): Promise<ScrapeResult>;

  /**
   * Abstract method to extract article content from URL
   */
  abstract extractArticle(url: string): Promise<ScrapedArticle | null>;

  /**
   * Main entry point for scraping
   */
  async run(): Promise<ScrapeResult> {
    const startedAt = new Date();
    logger.info(`Starting scraper: ${this.sourceName}`);

    try {
      // Get source from database
      const source = await prisma.newsSource.findFirst({
        where: { name: this.sourceName },
      });

      if (!source) {
        throw new Error(`Source ${this.sourceName} not found in database`);
      }

      if (!source.isActive) {
        logger.info(`Source ${this.sourceName} is inactive, skipping`);
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesSaved: 0,
          error: 'Source is inactive',
        };
      }

      // Check robots.txt
      await this.checkRobotsTxt(this.baseUrl);

      // Run scraper
      const result = await this.scrape();

      // Update last scraped time
      await prisma.newsSource.update({
        where: { id: source.id },
        data: { lastScrapedAt: new Date() },
      });

      // Log activity
      await this.logScrapingActivity(
        source.id,
        startedAt,
        result.articlesFound,
        result.articlesSaved,
        result.success ? 'success' : 'failed',
        result.error
      );

      logger.info(
        `Scraper ${this.sourceName} completed: ${result.articlesSaved}/${result.articlesFound} articles saved`
      );

      return result;
    } catch (error: any) {
      logger.error(`Scraper ${this.sourceName} failed:`, error);

      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesSaved: 0,
        error: error.message,
      };
    } finally {
      await this.closeBrowser();
    }
  }
}

export default BaseScraper;
