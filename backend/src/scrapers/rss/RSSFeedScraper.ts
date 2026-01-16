import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import logger from '../../utils/logger';
import prisma from '../../config/database';

export interface RSSArticle {
  title: string;
  link: string;
  pubDate: Date;
  description?: string;
  categories?: string[];
  tickers?: string[];
}

/**
 * RSS Feed Scraper Base Class
 * Fetches and parses RSS feeds from Norwegian financial news sources
 */
export class RSSFeedScraper {
  constructor(
    private readonly sourceName: string,
    private readonly feedUrl: string,
    private readonly userAgent: string = 'JGroupInvest/1.0 (Educational Research)'
  ) {}

  /**
   * Fetch and parse RSS feed
   */
  async fetchFeed(): Promise<RSSArticle[]> {
    try {
      logger.info(`Fetching RSS feed from ${this.feedUrl}`);

      const response = await axios.get(this.feedUrl, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        timeout: 30000,
      });

      const parsed = await parseStringPromise(response.data);

      if (!parsed.rss || !parsed.rss.channel || !parsed.rss.channel[0].item) {
        logger.warn(`No items found in RSS feed from ${this.sourceName}`);
        return [];
      }

      const items = parsed.rss.channel[0].item;
      const articles: RSSArticle[] = [];

      for (const item of items) {
        try {
          const article = this.parseItem(item);
          if (article) {
            articles.push(article);
          }
        } catch (error: any) {
          logger.error(`Error parsing RSS item from ${this.sourceName}:`, error.message);
        }
      }

      logger.info(`Fetched ${articles.length} articles from ${this.sourceName} RSS feed`);
      return articles;
    } catch (error: any) {
      logger.error(`Error fetching RSS feed from ${this.sourceName}:`, error.message);
      return [];
    }
  }

  /**
   * Parse individual RSS item
   */
  private parseItem(item: any): RSSArticle | null {
    try {
      const title = item.title?.[0];
      const link = item.link?.[0];
      const pubDateStr = item.pubDate?.[0];
      const description = item.description?.[0];

      if (!title || !link) {
        return null;
      }

      // Parse publication date
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();
      if (isNaN(pubDate.getTime())) {
        logger.warn(`Invalid date for article: ${title}`);
        return null;
      }

      // Extract categories
      const categories: string[] = [];
      if (item.category) {
        for (const cat of item.category) {
          if (typeof cat === 'string') {
            categories.push(cat);
          } else if (cat._) {
            categories.push(cat._);
          }
        }
      }

      // Extract stock tickers (E24 specific - tags companies)
      const tickers: string[] = [];
      // E24 may include tickers in categories or custom fields
      for (const cat of categories) {
        // Match Oslo Stock Exchange tickers (e.g., FRO.OSE, EQNR.OSE)
        if (cat.match(/^[A-Z]+\.OSE$/)) {
          tickers.push(cat.replace('.OSE', '.OL')); // Convert to Yahoo Finance format
        }
      }

      return {
        title,
        link,
        pubDate,
        description,
        categories,
        tickers,
      };
    } catch (error: any) {
      logger.error('Error parsing RSS item:', error);
      return null;
    }
  }

  /**
   * Save articles to database
   */
  async saveArticles(articles: RSSArticle[]): Promise<number> {
    try {
      const source = await prisma.newsSource.findFirst({
        where: { name: this.sourceName },
      });

      if (!source) {
        logger.error(`News source ${this.sourceName} not found in database`);
        return 0;
      }

      let saved = 0;

      for (const article of articles) {
        try {
          // Check if article already exists
          const existing = await prisma.newsArticle.findUnique({
            where: { url: article.link },
          });

          if (existing) {
            continue; // Skip duplicates
          }

          // Create article
          await prisma.newsArticle.create({
            data: {
              sourceId: source.id,
              title: article.title,
              url: article.link,
              content: article.description || '',
              summary: article.description || '',
              publishedAt: article.pubDate,
              language: 'no',
            },
          });

          saved++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Unique constraint violation - article already exists
            continue;
          }
          logger.error(`Error saving article ${article.link}:`, error.message);
        }
      }

      logger.info(`Saved ${saved} new articles from ${this.sourceName}`);
      return saved;
    } catch (error: any) {
      logger.error(`Error saving articles from ${this.sourceName}:`, error);
      return 0;
    }
  }

  /**
   * Scrape RSS feed and save articles
   */
  async scrape(): Promise<{ articlesFound: number; articlesSaved: number }> {
    const articles = await this.fetchFeed();
    const saved = await this.saveArticles(articles);

    return {
      articlesFound: articles.length,
      articlesSaved: saved,
    };
  }
}

// E24 RSS Feed Scraper
export const e24RSScraper = new RSSFeedScraper('E24.no', 'https://www.e24.no/feed/rss');

// DN RSS Feed Scraper
export const dnRSScraper = new RSSFeedScraper('Dagens Næringsliv', 'https://www.dn.no/feed');
