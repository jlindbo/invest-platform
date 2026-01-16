/**
 * Recalculate technical indicators for all target stocks
 * Run with: npx tsx src/scripts/recalculate-indicators.ts
 */
import prisma from '../config/database';
import logger from '../utils/logger';
import technicalIndicatorsService from '../services/technicalIndicators.service';

async function recalculateIndicators() {
  try {
    // Get all target stocks
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      select: { ticker: true },
    });

    logger.info(`Recalculating indicators for ${companies.length} target stocks...`);

    for (const company of companies) {
      logger.info(`Processing ${company.ticker}...`);

      const result = await technicalIndicatorsService.calculateAndSaveIndicators(company.ticker);

      if (result.success) {
        logger.info(`✓ ${company.ticker}: Saved ${result.savedCount} indicators`);
      } else {
        logger.error(`✗ ${company.ticker}: ${result.error}`);
      }
    }

    logger.info('✅ All indicators recalculated successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error recalculating indicators:', error);
    process.exit(1);
  }
}

recalculateIndicators();
