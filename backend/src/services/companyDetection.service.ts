import prisma from '../config/database';
import logger from '../utils/logger';

interface CompanyMatch {
  companyId: number;
  ticker: string;
  name: string;
  matchCount: number;
  relevanceScore: number;
}

/**
 * Service for detecting company mentions in news articles
 */
class CompanyDetectionService {
  private companyNamesCache: Map<number, string[]> = new Map();
  private cacheInitialized: boolean = false;

  /**
   * Initialize company names cache
   */
  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;

    const companies = await prisma.company.findMany({
      where: { isTracked: true },
    });

    for (const company of companies) {
      const variations = this.generateNameVariations(company.name, company.ticker);
      this.companyNamesCache.set(company.id, variations);
    }

    this.cacheInitialized = true;
    logger.info(`Company name cache initialized with ${companies.length} companies`);
  }

  /**
   * Generate name variations for better matching
   */
  private generateNameVariations(name: string, ticker: string): string[] {
    const variations: string[] = [name];

    // Add ticker without .OL suffix
    const tickerBase = ticker.replace('.OL', '');
    variations.push(tickerBase);

    // Add variations of company name
    variations.push(name.replace(/\s+AS(A)?$/i, '').trim()); // Remove AS/ASA suffix
    variations.push(name.replace(/\s+AS(A)?$/i, '').toLowerCase());

    // Add common abbreviations
    if (name.includes(' ')) {
      const words = name.split(' ');
      if (words.length > 1) {
        variations.push(words[0]); // First word only
      }
    }

    return variations;
  }

  /**
   * Detect companies mentioned in text
   */
  async detectCompanies(text: string): Promise<CompanyMatch[]> {
    await this.initializeCache();

    const matches: CompanyMatch[] = [];
    const lowerText = text.toLowerCase();

    for (const [companyId, variations] of this.companyNamesCache.entries()) {
      let matchCount = 0;

      for (const variation of variations) {
        const regex = new RegExp(`\\b${variation.toLowerCase()}\\b`, 'gi');
        const found = lowerText.match(regex);
        if (found) {
          matchCount += found.length;
        }
      }

      if (matchCount > 0) {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
        });

        if (company) {
          // Calculate relevance score (0.0 to 1.0)
          // More mentions = higher relevance, capped at 1.0
          const relevanceScore = Math.min(matchCount / 5, 1.0);

          matches.push({
            companyId: company.id,
            ticker: company.ticker,
            name: company.name,
            matchCount,
            relevanceScore,
          });
        }
      }
    }

    // Sort by relevance score (highest first)
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return matches;
  }

  /**
   * Link article to companies based on content
   */
  async linkArticleToCompanies(articleId: number): Promise<number> {
    try {
      const article = await prisma.newsArticle.findUnique({
        where: { id: articleId },
      });

      if (!article) {
        throw new Error(`Article ${articleId} not found`);
      }

      // Detect companies in title and content
      const searchText = `${article.title} ${article.content || ''} ${article.summary || ''}`;
      const companies = await this.detectCompanies(searchText);

      let linkedCount = 0;

      for (const company of companies) {
        try {
          await prisma.newsCompany.create({
            data: {
              newsId: articleId,
              companyId: company.companyId,
              relevanceScore: company.relevanceScore,
            },
          });
          linkedCount++;
        } catch (error: any) {
          // Ignore duplicate errors
          if (!error.message.includes('Unique constraint')) {
            logger.error(`Error linking article ${articleId} to company ${company.ticker}:`, error.message);
          }
        }
      }

      if (linkedCount > 0) {
        logger.info(`Linked article ${articleId} to ${linkedCount} companies`);
      }

      return linkedCount;
    } catch (error: any) {
      logger.error(`Error linking article ${articleId}:`, error.message);
      return 0;
    }
  }

  /**
   * Process all unlinked articles
   */
  async processUnlinkedArticles(limit: number = 100): Promise<{
    processed: number;
    linked: number;
  }> {
    try {
      // Find articles without company links
      const articles = await prisma.newsArticle.findMany({
        where: {
          newsCompanies: {
            none: {},
          },
        },
        take: limit,
        orderBy: {
          publishedAt: 'desc',
        },
      });

      logger.info(`Processing ${articles.length} unlinked articles`);

      let linked = 0;

      for (const article of articles) {
        const count = await this.linkArticleToCompanies(article.id);
        if (count > 0) {
          linked++;
        }

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Processed ${articles.length} articles, linked ${linked} to companies`);

      return {
        processed: articles.length,
        linked,
      };
    } catch (error: any) {
      logger.error('Error processing unlinked articles:', error);
      return {
        processed: 0,
        linked: 0,
      };
    }
  }

  /**
   * Refresh company cache
   */
  async refreshCache(): Promise<void> {
    this.companyNamesCache.clear();
    this.cacheInitialized = false;
    await this.initializeCache();
  }
}

export default new CompanyDetectionService();
