import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('🌱 Starting database seeding...');

  try {
    // Seed target companies (Norwegian stocks on Oslo Børs)
    logger.info('Seeding target companies...');

    const companies = await prisma.company.createMany({
      data: [
        {
          ticker: 'VAR.OL',
          name: 'Vår Energi AS',
          sector: 'Energy',
          industry: 'Oil & Gas Exploration & Production',
          isTracked: true,
          isTarget: true,
        },
        {
          ticker: 'DNB.OL',
          name: 'DNB Bank ASA',
          sector: 'Financial Services',
          industry: 'Banks - Regional',
          isTracked: true,
          isTarget: true,
        },
        {
          ticker: 'STB.OL',
          name: 'Storebrand ASA',
          sector: 'Financial Services',
          industry: 'Insurance - Life',
          isTracked: true,
          isTarget: true,
        },
      ],
      skipDuplicates: true,
    });

    logger.info(`✅ Created ${companies.count} target companies`);

    // Seed news sources
    logger.info('Seeding news sources...');

    const newsSources = await prisma.newsSource.createMany({
      data: [
        {
          name: 'E24.no',
          url: 'https://e24.no',
          scraperType: 'e24',
          isActive: true,
        },
        {
          name: 'Dagens Næringsliv',
          url: 'https://www.dn.no',
          scraperType: 'dn',
          isActive: true,
        },
        {
          name: 'Finansavisen',
          url: 'https://www.finansavisen.no',
          scraperType: 'finansavisen',
          isActive: true,
        },
        {
          name: 'Oslo Børs',
          url: 'https://www.oslobors.no',
          scraperType: 'oslobors',
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });

    logger.info(`✅ Created ${newsSources.count} news sources`);

    // Additional companies to track (popular Norwegian stocks)
    logger.info('Seeding additional tracked companies...');

    const additionalCompanies = await prisma.company.createMany({
      data: [
        {
          ticker: 'EQNR.OL',
          name: 'Equinor ASA',
          sector: 'Energy',
          industry: 'Oil & Gas Integrated',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'TEL.OL',
          name: 'Telenor ASA',
          sector: 'Communication Services',
          industry: 'Telecom Services',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'MOWI.OL',
          name: 'Mowi ASA',
          sector: 'Consumer Defensive',
          industry: 'Farm Products',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'NHY.OL',
          name: 'Norsk Hydro ASA',
          sector: 'Basic Materials',
          industry: 'Aluminum',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'ORK.OL',
          name: 'Orkla ASA',
          sector: 'Consumer Defensive',
          industry: 'Packaged Foods',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'YAR.OL',
          name: 'Yara International ASA',
          sector: 'Basic Materials',
          industry: 'Agricultural Inputs',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'SALM.OL',
          name: 'SalMar ASA',
          sector: 'Consumer Defensive',
          industry: 'Farm Products',
          isTracked: true,
          isTarget: false,
        },
        {
          ticker: 'BAKKA.OL',
          name: 'Aker BP ASA',
          sector: 'Energy',
          industry: 'Oil & Gas Exploration & Production',
          isTracked: true,
          isTarget: false,
        },
      ],
      skipDuplicates: true,
    });

    logger.info(`✅ Created ${additionalCompanies.count} additional tracked companies`);

    // Summary
    const totalCompanies = await prisma.company.count();
    const targetCompanies = await prisma.company.count({ where: { isTarget: true } });
    const totalSources = await prisma.newsSource.count();

    logger.info('\n📊 Seeding Summary:');
    logger.info(`   Total companies: ${totalCompanies}`);
    logger.info(`   Target companies: ${targetCompanies}`);
    logger.info(`   News sources: ${totalSources}`);
    logger.info('\n✨ Database seeding completed successfully!');
  } catch (error) {
    logger.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    logger.error('Fatal error during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
