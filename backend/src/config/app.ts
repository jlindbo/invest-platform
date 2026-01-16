import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://invest_user:changeme@localhost:5432/invest_db',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD !== undefined ? process.env.REDIS_PASSWORD : 'changeme',
    host: process.env.BULL_REDIS_HOST || 'localhost',
    port: parseInt(process.env.BULL_REDIS_PORT || '6379', 10),
  },

  // ML Service
  mlService: {
    url: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  },

  // Scraping
  scraping: {
    userAgent: process.env.USER_AGENT || 'JGroupInvest/1.0 (Educational Purpose)',
    delayMs: parseInt(process.env.SCRAPING_DELAY_MS || '2000', 10),
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '3', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Job Schedules
  schedules: {
    priceCollection: process.env.PRICE_COLLECTION_SCHEDULE || '0 16 * * 1-5',
    intradayCollection: process.env.INTRADAY_COLLECTION_SCHEDULE || '*/2 9-16 * * 1-5',
    newsScraping: process.env.NEWS_SCRAPING_SCHEDULE || '0 */2 * * *',
    prediction: process.env.PREDICTION_SCHEDULE || '0 6 * * 1-5',
    opportunityScan: process.env.OPPORTUNITY_SCAN_SCHEDULE || '*/30 * * * *',
  },

  // Caching
  cache: {
    liveComparisonTtl: parseInt(process.env.CACHE_LIVE_COMPARISON_TTL || '300', 10), // 5 minutes
    intradayDataTtl: parseInt(process.env.CACHE_INTRADAY_TTL || '120', 10), // 2 minutes
  },

  // Oslo Børs Market
  market: {
    timezone: 'Europe/Oslo',
    tradingHours: {
      open: { hour: 9, minute: 0 },
      close: { hour: 16, minute: 20 },
    },
    tradingDays: [1, 2, 3, 4, 5], // Monday to Friday
    // Norwegian market holidays 2026 (add more years as needed)
    holidays: [
      '2026-01-01', // New Year's Day
      '2026-04-02', // Maundy Thursday
      '2026-04-03', // Good Friday
      '2026-04-06', // Easter Monday
      '2026-05-01', // Labour Day
      '2026-05-14', // Ascension Day
      '2026-05-17', // Constitution Day
      '2026-05-25', // Whit Monday
      '2026-12-25', // Christmas Day
      '2026-12-26', // Boxing Day
    ],
  },
};

export default config;
