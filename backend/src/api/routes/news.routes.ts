import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import { triggerNewsScraping } from '../../jobs/newsScraping.job';

const router = Router();

/**
 * GET /api/v1/news
 * Get recent news articles
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, sentiment } = req.query;

    const where: any = {};

    // Filter by sentiment if specified
    if (sentiment) {
      if (sentiment === 'positive') {
        where.sentimentScore = { gte: 0.3 };
      } else if (sentiment === 'negative') {
        where.sentimentScore = { lte: -0.3 };
      } else if (sentiment === 'neutral') {
        where.sentimentScore = { gte: -0.3, lte: 0.3 };
      }
    }

    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
      include: {
        source: true,
        newsCompanies: {
          include: {
            company: true,
          },
        },
      },
    });

    res.json({
      success: true,
      count: articles.length,
      articles: articles.map(article => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        url: article.url,
        author: article.author,
        publishedAt: article.publishedAt,
        source: article.source?.name,
        sentiment: article.sentimentScore ? {
          score: Number(article.sentimentScore),
          label: article.sentimentLabel,
          confidence: article.sentimentConfidence ? Number(article.sentimentConfidence) : null,
        } : null,
        companies: article.newsCompanies.map(nc => ({
          ticker: nc.company.ticker,
          name: nc.company.name,
          relevance: nc.relevanceScore ? Number(nc.relevanceScore) : null,
        })),
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching news:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch news',
    });
  }
});

/**
 * GET /api/v1/news/:id
 * Get specific news article
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const article = await prisma.newsArticle.findUnique({
      where: { id: Number(id) },
      include: {
        source: true,
        newsCompanies: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found',
      });
    }

    res.json({
      success: true,
      article: {
        id: article.id,
        title: article.title,
        content: article.content,
        summary: article.summary,
        url: article.url,
        author: article.author,
        publishedAt: article.publishedAt,
        source: article.source?.name,
        sentiment: article.sentimentScore ? {
          score: Number(article.sentimentScore),
          label: article.sentimentLabel,
          confidence: article.sentimentConfidence ? Number(article.sentimentConfidence) : null,
        } : null,
        companies: article.newsCompanies.map(nc => ({
          ticker: nc.company.ticker,
          name: nc.company.name,
          relevance: nc.relevanceScore ? Number(nc.relevanceScore) : null,
        })),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article',
    });
  }
});

/**
 * GET /api/v1/news/company/:ticker
 * Get news articles for a specific company
 */
router.get('/company/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found',
      });
    }

    const articles = await prisma.newsArticle.findMany({
      where: {
        newsCompanies: {
          some: {
            companyId: company.id,
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
      include: {
        source: true,
        newsCompanies: {
          where: { companyId: company.id },
        },
      },
    });

    res.json({
      success: true,
      ticker,
      companyName: company.name,
      count: articles.length,
      articles: articles.map(article => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        url: article.url,
        author: article.author,
        publishedAt: article.publishedAt,
        source: article.source?.name,
        sentiment: article.sentimentScore ? {
          score: Number(article.sentimentScore),
          label: article.sentimentLabel,
        } : null,
        relevance: article.newsCompanies[0]?.relevanceScore
          ? Number(article.newsCompanies[0].relevanceScore)
          : null,
      })),
    });
  } catch (error: any) {
    logger.error('Error fetching company news:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch company news',
    });
  }
});

/**
 * GET /api/v1/news/sentiment/aggregate
 * Get aggregated sentiment scores
 */
router.get('/sentiment/aggregate', async (req: Request, res: Response) => {
  try {
    const { ticker, days = 7 } = req.query;

    const where: any = {
      publishedAt: {
        gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000),
      },
    };

    // Filter by company if specified
    if (ticker) {
      const company = await prisma.company.findUnique({
        where: { ticker: String(ticker) },
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found',
        });
      }

      where.newsCompanies = {
        some: {
          companyId: company.id,
        },
      };
    }

    const articles = await prisma.newsArticle.findMany({
      where,
      include: {
        newsCompanies: {
          include: {
            company: true,
          },
        },
      },
    });

    // Calculate aggregated sentiment
    const sentimentScores = articles
      .filter(a => a.sentimentScore !== null)
      .map(a => Number(a.sentimentScore));

    const averageSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length
      : 0;

    const positiveCount = sentimentScores.filter(s => s > 0.3).length;
    const neutralCount = sentimentScores.filter(s => s >= -0.3 && s <= 0.3).length;
    const negativeCount = sentimentScores.filter(s => s < -0.3).length;

    res.json({
      success: true,
      ticker: ticker || 'all',
      days: Number(days),
      totalArticles: articles.length,
      averageSentiment: Number(averageSentiment.toFixed(3)),
      distribution: {
        positive: positiveCount,
        neutral: neutralCount,
        negative: negativeCount,
      },
    });
  } catch (error: any) {
    logger.error('Error calculating sentiment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate sentiment',
    });
  }
});

/**
 * POST /api/v1/news/scrape
 * Trigger manual news scraping
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { sources } = req.body;

    const job = await triggerNewsScraping(sources);

    res.json({
      success: true,
      message: 'News scraping triggered',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('Error triggering news scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger news scraping',
    });
  }
});

export default router;
