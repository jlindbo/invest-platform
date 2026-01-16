import prisma from '../config/database';
import logger from '../utils/logger';

async function main() {
  try {
    logger.info('Creating mock predictions for target companies...');

    // Get all target companies with their latest stock prices
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      include: {
        stockPrices: {
          orderBy: { date: 'desc' },
          take: 2,
        },
      },
    });

    logger.info(`Found ${companies.length} target companies`);

    // First, create a mock ML model record
    const model = await prisma.mlModel.upsert({
      where: {
        name_version: {
          name: 'test_model',
          version: '20260116_test',
        },
      },
      create: {
        name: 'test_model',
        version: '20260116_test',
        modelType: 'LSTM',
        trainingDate: new Date(),
        isActive: true,
      },
      update: {},
    });

    logger.info(`Using ML model: ${model.version}`);

    // Create predictions for each company
    for (const company of companies) {
      if (company.stockPrices.length < 2) {
        logger.warn(`Skipping ${company.ticker}: not enough price data`);
        continue;
      }

      const latestPrice = Number(company.stockPrices[0].close);
      const previousPrice = Number(company.stockPrices[1].close);
      const actualChange = ((latestPrice - previousPrice) / previousPrice) * 100;

      // Create a prediction that's slightly off from actual for demonstration
      const predictionOffset = (Math.random() - 0.5) * 10; // Random offset between -5% and +5%
      const predictedChange = actualChange + predictionOffset;
      const predictedPrice = previousPrice * (1 + predictedChange / 100);
      const predictedDirection = predictedChange > 0 ? 'up' : 'down';

      const prediction = await prisma.prediction.create({
        data: {
          companyId: company.id,
          modelId: model.id,
          predictionDate: new Date(),
          targetDate: new Date(), // Same day for testing
          predictedPrice,
          predictedChangePercent: predictedChange,
          predictedDirection,
          confidence: 0.15 + Math.random() * 0.15, // Random confidence between 0.15 and 0.30
        },
      });

      logger.info(`  -> Created prediction for ${company.ticker}:`);
      logger.info(`     Actual: ${latestPrice.toFixed(2)} (${actualChange.toFixed(2)}% ${actualChange > 0 ? 'up' : 'down'})`);
      logger.info(`     Predicted: ${predictedPrice.toFixed(2)} (${predictedChange.toFixed(2)}% ${predictedDirection})`);
    }

    logger.info('✅ Mock predictions created successfully!');
  } catch (error: any) {
    logger.error('Error creating mock predictions:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
