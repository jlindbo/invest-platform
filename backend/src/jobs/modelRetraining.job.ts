import prisma from '../config/database';
import logger from '../utils/logger';
import { mlClientService } from '../services/mlClient.service';
import { stockDataService } from '../services/stockData.service';

/**
 * Handles automatic model retraining
 * Runs weekly or when performance drops below threshold
 */
export class ModelRetrainingJob {
  private readonly ACCURACY_THRESHOLD = 0.50; // Retrain if accuracy drops below 50%
  private readonly MIN_PREDICTIONS_FOR_EVAL = 20; // Need at least 20 predictions to evaluate

  /**
   * Check if models need retraining and trigger training
   */
  async checkAndRetrainModels(): Promise<{
    modelsChecked: number;
    modelsRetrained: number;
    errors: string[];
  }> {
    try {
      logger.info('Starting model retraining check');

      const targetCompanies = await prisma.company.findMany({
        where: { isTarget: true },
      });

      let modelsChecked = 0;
      let modelsRetrained = 0;
      const errors: string[] = [];

      for (const company of targetCompanies) {
        try {
          modelsChecked++;

          // Get active model for this company
          const activeModel = await prisma.mLModel.findFirst({
            where: {
              name: `lstm_${company.ticker}`,
              isActive: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          if (!activeModel) {
            logger.info(`No active model found for ${company.ticker}, triggering initial training`);
            await this.retrainModel(company.ticker);
            modelsRetrained++;
            continue;
          }

          // Check if model needs retraining based on accuracy
          const needsRetraining = await this.shouldRetrain(company.id, activeModel.id);

          if (needsRetraining) {
            logger.info(`Model for ${company.ticker} needs retraining`);
            await this.retrainModel(company.ticker);
            modelsRetrained++;
          } else {
            logger.info(`Model for ${company.ticker} is performing well, no retraining needed`);
          }
        } catch (error: any) {
          const errorMsg = `Error checking ${company.ticker}: ${error.message}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      logger.info(
        `Model retraining check complete: ${modelsChecked} checked, ${modelsRetrained} retrained`
      );

      return { modelsChecked, modelsRetrained, errors };
    } catch (error: any) {
      logger.error('Model retraining job failed:', error);
      throw error;
    }
  }

  /**
   * Determine if a model should be retrained
   */
  private async shouldRetrain(companyId: number, modelId: number): Promise<boolean> {
    try {
      // Get recent predictions for this model
      const recentPredictions = await prisma.prediction.findMany({
        where: {
          companyId,
          modelId,
          isCorrect: { not: null }, // Only validated predictions
        },
        orderBy: {
          predictionDate: 'desc',
        },
        take: this.MIN_PREDICTIONS_FOR_EVAL,
      });

      // Not enough data to evaluate
      if (recentPredictions.length < this.MIN_PREDICTIONS_FOR_EVAL) {
        logger.info(
          `Only ${recentPredictions.length} validated predictions, need ${this.MIN_PREDICTIONS_FOR_EVAL} to evaluate`
        );
        return false;
      }

      // Calculate accuracy
      const correct = recentPredictions.filter((p) => p.isCorrect).length;
      const accuracy = correct / recentPredictions.length;

      logger.info(
        `Model accuracy: ${(accuracy * 100).toFixed(2)}% (${correct}/${recentPredictions.length})`
      );

      // Check if accuracy is below threshold
      if (accuracy < this.ACCURACY_THRESHOLD) {
        logger.warn(`Accuracy ${(accuracy * 100).toFixed(2)}% is below threshold ${(this.ACCURACY_THRESHOLD * 100).toFixed(2)}%`);
        return true;
      }

      // Check if model is old (more than 30 days)
      const modelAge = Date.now() - new Date(recentPredictions[0].createdAt).getTime();
      const daysOld = modelAge / (1000 * 60 * 60 * 24);

      if (daysOld > 30) {
        logger.info(`Model is ${daysOld.toFixed(0)} days old, retraining recommended`);
        return true;
      }

      return false;
    } catch (error: any) {
      logger.error('Error checking if model should retrain:', error);
      return false;
    }
  }

  /**
   * Trigger model retraining for a specific stock
   */
  private async retrainModel(ticker: string): Promise<void> {
    try {
      logger.info(`Triggering retraining for ${ticker}`);

      // Check if we have enough data
      const company = await prisma.company.findFirst({
        where: { ticker },
      });

      if (!company) {
        throw new Error(`Company ${ticker} not found`);
      }

      const priceCount = await prisma.stockPrice.count({
        where: { companyId: company.id },
      });

      if (priceCount < 100) {
        logger.warn(
          `Only ${priceCount} price records for ${ticker}, need at least 100 for training`
        );
        return;
      }

      // Deactivate old models
      await prisma.mLModel.updateMany({
        where: {
          name: `lstm_${ticker}`,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      // Trigger training via ML service
      const result = await mlClientService.trainModel(ticker, 50);

      if (result.success) {
        logger.info(`Successfully retrained model for ${ticker}`);
      } else {
        logger.error(`Failed to retrain model for ${ticker}: ${result.error}`);
      }
    } catch (error: any) {
      logger.error(`Error retraining model for ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * Force retrain all models (manual trigger)
   */
  async retrainAllModels(): Promise<{
    totalModels: number;
    successful: number;
    failed: number;
  }> {
    try {
      logger.info('Force retraining all models');

      const targetCompanies = await prisma.company.findMany({
        where: { isTarget: true },
      });

      let successful = 0;
      let failed = 0;

      for (const company of targetCompanies) {
        try {
          await this.retrainModel(company.ticker);
          successful++;
        } catch (error: any) {
          logger.error(`Failed to retrain ${company.ticker}:`, error.message);
          failed++;
        }
      }

      logger.info(
        `Force retraining complete: ${successful} successful, ${failed} failed`
      );

      return {
        totalModels: targetCompanies.length,
        successful,
        failed,
      };
    } catch (error: any) {
      logger.error('Force retrain all models failed:', error);
      throw error;
    }
  }
}

export const modelRetrainingJob = new ModelRetrainingJob();
