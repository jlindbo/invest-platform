import stockDataService from '../services/stockData.service';
import logger from '../utils/logger';
import prisma from '../config/database';

async function main() {
  try {
    logger.info('Fetching latest stock prices for target companies...');

    // Get all target companies
    const companies = await prisma.company.findMany({
      where: { isTarget: true },
      select: { ticker: true },
    });

    logger.info(`Found ${companies.length} target companies`);

    // Fetch latest prices
    for (const company of companies) {
      logger.info(`Fetching prices for ${company.ticker}...`);
      const result = await stockDataService.collectStockData(company.ticker, 7); // Last 7 days
      logger.info(`  -> Saved ${result.savedCount} price records`);
    }

    logger.info('✅ Stock prices fetched successfully!');
  } catch (error: any) {
    logger.error('Error fetching stock prices:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
