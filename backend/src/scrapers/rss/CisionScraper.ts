import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../../utils/logger';
import prisma from '../../config/database';

interface CisionArticle {
  title: string;
  link: string;
  pubDate: Date;
  description?: string;
  company?: string;
}

/**
 * Cision Norge Press Release Scraper
 * Scrapes press releases from Norwegian companies via Cision
 */
export class CisionScraper {
  private readonly baseUrl = 'https://news.cision.com/no';
  private readonly userAgent = 'JGroupInvest/1.0 (Educational Research)';

  /**
   * Fetch press releases from Cision Norge
   */
  async fetchArticles(maxPages: number = 3): Promise<CisionArticle[]> {
    const articles: CisionArticle[] = [];

    try {
      logger.info(`Fetching press releases from Cision Norge`);

      for (let page = 1; page <= maxPages; page++) {
        try {
          const url = page === 1 ? this.baseUrl : `${this.baseUrl}?pageIx=${page}`;

          const response = await axios.get(url, {
            headers: {
              'User-Agent': this.userAgent,
              Accept: 'text/html',
            },
            timeout: 30000,
          });

          const $ = cheerio.load(response.data);
          const pageArticles = this.parseArticles($);

          articles.push(...pageArticles);
          logger.info(`Cision page ${page}: Found ${pageArticles.length} releases`);

          // Delay between pages
          if (page < maxPages) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error: any) {
          logger.error(`Error fetching Cision page ${page}:`, error.message);
          break;
        }
      }

      logger.info(`Fetched ${articles.length} total articles from Cision Norge`);
      return articles;
    } catch (error: any) {
      logger.error('Error fetching Cision articles:', error.message);
      return [];
    }
  }

  /**
   * Parse articles from Cision page HTML
   */
  private parseArticles($: cheerio.CheerioAPI): CisionArticle[] {
    const articles: CisionArticle[] = [];

    // Find article containers
    $('article').each((_, element) => {
      try {
        const $article = $(element);
        const $link = $article.find('a[href*="/no/"]').first();

        if (!$link.length) return;

        const title = $article.find('h3, h2').first().text().trim();
        const link = $link.attr('href');
        const description = $article.find('p').first().text().trim();

        // Extract date from time element
        const timeText = $article.find('time').text().trim();
        const pubDate = this.parseDate(timeText);

        // Try to extract company name
        const companyLink = $article.find('a[href*="/no/"]').last();
        const company = companyLink.attr('href')?.split('/no/')[1]?.split('/')[0];

        if (title && link) {
          // Convert relative URL to absolute
          const fullLink = link.startsWith('http') ? link : `https://news.cision.com${link}`;

          articles.push({
            title,
            link: fullLink,
            pubDate,
            description: description || undefined,
            company: company || undefined,
          });
        }
      } catch (error: any) {
        logger.error('Error parsing Cision article:', error.message);
      }
    });

    return articles;
  }

  /**
   * Parse Norwegian date format from Cision
   */
  private parseDate(dateStr: string): Date {
    try {
      // Format: "tir., des 23, 2025 10:18 CET"
      // Try to parse, fallback to current date if fails
      const cleanedDate = dateStr.replace(/[^\d\s:,-]/g, '').trim();
      const parsed = new Date(dateStr);

      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      return new Date();
    } catch {
      return new Date();
    }
  }

  /**
   * Save articles to database
   */
  async saveArticles(articles: CisionArticle[]): Promise<number> {
    try {
      const source = await prisma.newsSource.findFirst({
        where: { name: 'Cision Norge' },
      });

      if (!source) {
        logger.error('Cision Norge source not found in database');
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
            continue;
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
            continue; // Duplicate
          }
          logger.error(`Error saving Cision article ${article.link}:`, error.message);
        }
      }

      logger.info(`Saved ${saved} new articles from Cision Norge`);
      return saved;
    } catch (error: any) {
      logger.error('Error saving Cision articles:', error);
      return 0;
    }
  }

  /**
   * Scrape Cision and save articles
   */
  async scrape(): Promise<{ articlesFound: number; articlesSaved: number }> {
    const articles = await this.fetchArticles(3); // Fetch 3 pages
    const saved = await this.saveArticles(articles);

    return {
      articlesFound: articles.length,
      articlesSaved: saved,
    };
  }
}

export const cisionScraper = new CisionScraper();
