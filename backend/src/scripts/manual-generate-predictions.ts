import prisma from '../config/database';
import logger from '../utils/logger';
import mlService from '../services/ml.service';

async function main() {
  try {
    logger.info('Generating predictions for target companies...');

    // Get all target companies with their latest stock prices
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 30, // Last 30 days for ML model
        },
      },
    });

    logger.info(`Found ${companies.length} target companies`);

    // Generate predictions for each company
    for (const company of companies) {
      if (company.stockPrices.length < 5) {
        logger.warn(`Skipping ${company.ticker}: not enough price data (${company.stockPrices.length} days)`);
        continue;
      }

      logger.info(`Generating prediction for ${company.ticker}...`);

      try {
        // Call ML service to generate prediction
        const prediction = await mlService.generatePrediction(company.id);

        if (prediction) {
          logger.info(`  -> Prediction created: ${prediction.predictedPrice} (confidence: ${prediction.confidence})`);
        } else {
          logger.warn(`  -> No prediction generated for ${company.ticker}`);
        }
      } catch (error: any) {
        logger.error(`  -> Error generating prediction for ${company.ticker}:`, error.message);
      }
    }

    logger.info('✅ Prediction generation completed!');
  } catch (error: any) {
    logger.error('Error generating predictions:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
