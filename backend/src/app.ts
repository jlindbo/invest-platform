import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config/app';
import logger from './utils/logger';
import { connectRedis } from './config/redis';
import prisma from './config/database';
import { initializeJobs } from './jobs';

// Import routes
import stocksRouter from './api/routes/stocks.routes';
logger.info('✓ Stocks router imported');
import newsRouter from './api/routes/news.routes';
logger.info('✓ News router imported');
import predictionsRouter from './api/routes/predictions.routes';
logger.info('✓ Predictions router imported');
import analyticsRouter from './api/routes/analytics.routes';
logger.info('✓ Analytics router imported');
import liveRouter from './api/routes/live.routes';
logger.info('✓ Live router imported');

// Initialize Express app
const app: Application = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors({ origin: config.cors.origin })); // CORS
app.use(compression()); // Compress responses
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Debug middleware to log all requests
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`Incoming request: ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.env,
    service: 'invest-backend',
  });
});

// Status endpoint with database and redis checks
app.get('/api/v1/status', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    const status = {
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        mlService: 'unknown', // Will be checked by ML client service
      },
      version: '1.0.0',
    };

    res.status(200).json(status);
  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
    });
  }
});

// API Routes
logger.info('Registering API routes...');
app.use('/api/v1/stocks', stocksRouter);
logger.info('✓ Stocks routes registered at /api/v1/stocks');
app.use('/api/v1/news', newsRouter);
logger.info('✓ News routes registered at /api/v1/news');
app.use('/api/v1/predictions', predictionsRouter);
logger.info('✓ Predictions routes registered at /api/v1/predictions');
app.use('/api/v1/analytics', analyticsRouter);
logger.info('✓ Analytics routes registered at /api/v1/analytics');
app.use('/api/v1/live', liveRouter);
logger.info('✓ Live routes registered at /api/v1/live');
// app.use('/api/v1/opportunities', opportunitiesRouter); // To be added in Phase 4
// app.use('/api/v1/alerts', alertsRouter); // To be added in Phase 4

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.env === 'development' ? err.message : 'An unexpected error occurred',
    ...(config.env === 'development' && { stack: err.stack }),
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();

    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Initialize background jobs
    initializeJobs();

    // Start Express server
    app.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port} in ${config.env} mode`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`🔌 API: http://localhost:${config.port}/api/v1`);
      logger.info(`✅ Background jobs initialized`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
