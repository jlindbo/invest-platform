import { BaseScraper, ScrapedArticle, ScrapeResult } from './base/BaseScraper';
import logger from '../utils/logger';
import prisma from '../config/database';

/**
 * Scraper for DN.no (Dagens Næringsliv) - Leading Norwegian financial newspaper
 */
class DNScraper extends BaseScraper {
  constructor() {
    super('Dagens Næringsliv', 'https://www.dn.no');
  }

  /**
   * Scrape recent articles from DN.no
   */
  async scrape(): Promise<ScrapeResult> {
    const articles: ScrapedArticle[] = [];
    let articlesSaved = 0;

    try {
      const page = await this.createPage();

      // Navigate to Oslo Børs section or main page
      logger.info('DN: Navigating to main page');
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for content to load
      await page.waitForSelector('article, .article, a[href*="/artikkel/"]', {
        timeout: 10000,
      }).catch(() => {
        logger.warn('DN: Article selector timeout, continuing anyway');
      });

      // Extract article links
      const articleLinks = await page.evaluate(() => {
        const links: string[] = [];
        const articleElements = document.querySelectorAll('article a, a[href*="/artikkel/"]');

        articleElements.forEach((el) => {
          const href = el.getAttribute('href');
          if (href && href.includes('/artikkel/') && !links.includes(href)) {
            // Convert relative URLs to absolute
            const absoluteUrl = href.startsWith('http')
              ? href
              : `https://www.dn.no${href.startsWith('/') ? '' : '/'}${href}`;
            links.push(absoluteUrl);
          }
        });

        return [...new Set(links)].slice(0, 20); // Limit to 20 unique articles
      });

      logger.info(`DN: Found ${articleLinks.length} article links`);

      await page.close();

      // Get source ID
      const source = await prisma.newsSource.findFirst({
        where: { name: this.sourceName },
      });

      if (!source) {
        throw new Error('DN source not found in database');
      }

      // Extract each article
      for (const link of articleLinks) {
        try {
          await this.delay(); // Rate limiting

          const article = await this.extractArticle(link);

          if (article) {
            articles.push(article);

            const saved = await this.saveArticle(article, source.id);
            if (saved) {
              articlesSaved++;
            }
          }
        } catch (error: any) {
          logger.error(`DN: Error extracting article ${link}:`, error.message);
        }
      }

      return {
        success: true,
        articles,
        articlesFound: articleLinks.length,
        articlesSaved,
      };
    } catch (error: any) {
      logger.error('DN scraping failed:', error);
      return {
        success: false,
        articles,
        articlesFound: articles.length,
        articlesSaved,
        error: error.message,
      };
    }
  }

  /**
   * Extract article content from DN article page
   */
  async extractArticle(url: string): Promise<ScrapedArticle | null> {
    const page = await this.createPage();

    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // DN may have a paywall - we'll try to extract what we can
      const articleData = await page.evaluate(() => {
        // Try multiple selectors for title
        const titleSelectors = [
          'h1',
          '.article__title',
          '.article-title',
          '[data-testid="article-title"]',
          'article h1'
        ];
        let title = '';
        for (const selector of titleSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent) {
            title = el.textContent.trim();
            break;
          }
        }

        // Try multiple selectors for content
        const contentSelectors = [
          '.article__body',
          '.article-body',
          '[data-testid="article-content"]',
          'article .body',
          'article p',
          '.ingress', // DN uses this for intro text
        ];
        let content = '';
        for (const selector of contentSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            content = Array.from(elements)
              .map(el => el.textContent?.trim())
              .filter(Boolean)
              .join('\n\n');
            if (content) break;
          }
        }

        // Try to find author
        const authorSelectors = [
          '.article__byline',
          '.author',
          '[data-testid="author"]',
          '.byline',
        ];
        let author = '';
        for (const selector of authorSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent) {
            author = el.textContent.trim();
            break;
          }
        }

        // Try to find publish date
        const dateSelectors = ['time', '[datetime]', '.article__published-date', '.publish-date'];
        let publishedAt = '';
        for (const selector of dateSelectors) {
          const el = document.querySelector(selector);
          const datetime = el?.getAttribute('datetime') || el?.textContent?.trim();
          if (datetime) {
            publishedAt = datetime;
            break;
          }
        }

        return {
          title,
          content,
          author,
          publishedAt,
        };
      });

      await page.close();

      if (!articleData.title) {
        logger.warn(`DN: Could not extract title from ${url}`);
        return null;
      }

      // Parse published date
      let publishedAt: Date;
      if (articleData.publishedAt) {
        publishedAt = new Date(articleData.publishedAt);
        if (isNaN(publishedAt.getTime())) {
          publishedAt = new Date(); // Fallback to current date
        }
      } else {
        publishedAt = new Date();
      }

      // Create summary from first 200 characters of content
      const summary = articleData.content
        ? articleData.content.substring(0, 200) + (articleData.content.length > 200 ? '...' : '')
        : undefined;

      return {
        title: articleData.title,
        content: articleData.content || undefined,
        summary,
        url,
        author: articleData.author || undefined,
        publishedAt,
        language: 'no',
      };
    } catch (error: any) {
      logger.error(`DN: Error extracting article ${url}:`, error.message);
      await page.close();
      return null;
    }
  }
}

export default new DNScraper();
