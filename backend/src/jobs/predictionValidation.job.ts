import prisma from '../config/database';
import logger from '../utils/logger';
import { stockDataService } from '../services/stockData.service';

/**
 * Validates predictions against actual stock prices
 * Runs daily to check if yesterday's predictions were correct
 */
export class PredictionValidationJob {
  /**
   * Validate all unvalidated predictions where target date has passed
   */
  async validatePredictions(): Promise<{
    validated: number;
    correct: number;
    incorrect: number;
  }> {
    try {
      logger.info('Starting prediction validation job');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all predictions where target_date is in the past and not yet validated
      const unvalidatedPredictions = await prisma.prediction.findMany({
        where: {
          targetDate: {
            lt: today,
          },
          isCorrect: null,
        },
        include: {
          company: true,
        },
      });

      logger.info(`Found ${unvalidatedPredictions.length} predictions to validate`);

      let validated = 0;
      let correct = 0;
      let incorrect = 0;

      for (const prediction of unvalidatedPredictions) {
        try {
          // Get actual price for the target date
          const targetDate = new Date(prediction.targetDate);
          const nextDay = new Date(targetDate);
          nextDay.setDate(nextDay.getDate() + 1);

          const actualPrice = await prisma.stockPrice.findFirst({
            where: {
              companyId: prediction.companyId,
              date: {
                gte: targetDate,
                lt: nextDay,
              },
            },
            orderBy: {
              date: 'asc',
            },
          });

          if (!actualPrice) {
            logger.warn(
              `No price data found for ${prediction.company.ticker} on ${targetDate.toISOString()}`
            );
            continue;
          }

          // Get previous day's price to calculate actual direction
          const predictionDate = new Date(prediction.predictionDate);
          const previousPrice = await prisma.stockPrice.findFirst({
            where: {
              companyId: prediction.companyId,
              date: {
                lte: predictionDate,
              },
            },
            orderBy: {
              date: 'desc',
            },
          });

          if (!previousPrice) {
            logger.warn(
              `No previous price found for ${prediction.company.ticker} on ${predictionDate.toISOString()}`
            );
            continue;
          }

          // Calculate actual direction and change
          const actualChange = actualPrice.close - previousPrice.close;
          const actualChangePercent = (actualChange / previousPrice.close) * 100;
          const actualDirection = actualChange > 0 ? 'up' : actualChange < 0 ? 'down' : 'flat';

          // Determine if prediction was correct
          const isCorrect =
            (prediction.predictedDirection === 'up' && actualDirection === 'up') ||
            (prediction.predictedDirection === 'down' && actualDirection === 'down');

          // Calculate enhanced metrics

          // 1. Confidence-weighted score: confidence * isCorrect (0 if wrong)
          const confidenceWeightedScore = isCorrect ? Number(prediction.confidence) : 0;

          // 2. Price prediction error (MAPE): |predicted - actual| / actual * 100
          let priceErrorPercent = null;
          if (prediction.predictedPrice) {
            const predicted = Number(prediction.predictedPrice);
            const actual = Number(actualPrice.close);
            priceErrorPercent = Math.abs((predicted - actual) / actual) * 100;
          }

          // 3. Trading return: simulated return if we traded on this prediction
          // Strategy: Only trade if confidence > 50%, position size based on confidence
          let tradingReturn = null;
          if (Number(prediction.confidence) > 0.50) {
            // Position size: confidence * 100 (50% confidence = 50 NOK position per share)
            const positionMultiplier = Number(prediction.confidence);

            if (prediction.predictedDirection === 'up') {
              // Buy at previous price, sell at actual price
              const buyPrice = Number(previousPrice.close);
              const sellPrice = Number(actualPrice.close);
              const grossReturn = ((sellPrice - buyPrice) / buyPrice) * 100;
              // Apply position multiplier (trade more when confident)
              tradingReturn = grossReturn * positionMultiplier;
              // Subtract 0.2% transaction fees
              tradingReturn = tradingReturn - 0.2;
            } else if (prediction.predictedDirection === 'down') {
              // Short sell: profit when price goes down
              const shortPrice = Number(previousPrice.close);
              const coverPrice = Number(actualPrice.close);
              const grossReturn = ((shortPrice - coverPrice) / shortPrice) * 100;
              tradingReturn = grossReturn * positionMultiplier;
              tradingReturn = tradingReturn - 0.2; // Transaction fees
            }
          }

          // Update prediction with actual results and enhanced metrics
          await prisma.prediction.update({
            where: { id: prediction.id },
            data: {
              actualDirection,
              actualPrice: actualPrice.close,
              actualChangePercent: parseFloat(actualChangePercent.toFixed(2)),
              isCorrect,
              confidenceWeightedScore: parseFloat(confidenceWeightedScore.toFixed(4)),
              priceErrorPercent: priceErrorPercent ? parseFloat(priceErrorPercent.toFixed(2)) : null,
              tradingReturn: tradingReturn ? parseFloat(tradingReturn.toFixed(2)) : null,
            },
          });

          validated++;
          if (isCorrect) {
            correct++;
          } else {
            incorrect++;
          }

          logger.info(
            `Validated ${prediction.company.ticker}: Predicted ${prediction.predictedDirection}, Actual ${actualDirection}, Correct: ${isCorrect}`
          );
        } catch (error: any) {
          logger.error(
            `Error validating prediction ${prediction.id} for ${prediction.company.ticker}:`,
            error.message
          );
        }
      }

      // Calculate overall accuracy
      const accuracy = validated > 0 ? (correct / validated) * 100 : 0;

      logger.info(
        `Prediction validation complete: ${validated} validated, ${correct} correct (${accuracy.toFixed(2)}%), ${incorrect} incorrect`
      );

      return { validated, correct, incorrect };
    } catch (error: any) {
      logger.error('Prediction validation job failed:', error);
      throw error;
    }
  }

  /**
   * Get accuracy statistics for all models
   */
  async getAccuracyStats(): Promise<{
    overall: {
      total: number;
      correct: number;
      accuracy: number;
      confidenceWeightedAccuracy: number;
      avgPriceError: number;
      avgTradingReturn: number;
    };
    byStock: Array<{
      ticker: string;
      name: string;
      total: number;
      correct: number;
      accuracy: number;
      confidenceWeightedAccuracy: number;
      avgPriceError: number;
      avgTradingReturn: number;
    }>;
    byModel: Array<{
      modelId: number;
      modelName: string;
      total: number;
      correct: number;
      accuracy: number;
      confidenceWeightedAccuracy: number;
    }>;
  }> {
    try {
      // Overall accuracy
      const allValidated = await prisma.prediction.findMany({
        where: {
          isCorrect: { not: null },
        },
      });

      const totalValidated = allValidated.length;
      const totalCorrect = allValidated.filter((p) => p.isCorrect).length;
      const overallAccuracy = totalValidated > 0 ? (totalCorrect / totalValidated) * 100 : 0;

      // Calculate enhanced metrics
      const totalConfidenceWeightedScore = allValidated.reduce(
        (sum, p) => sum + (Number(p.confidenceWeightedScore) || 0),
        0
      );
      const confidenceWeightedAccuracy = totalValidated > 0
        ? (totalConfidenceWeightedScore / totalValidated) * 100
        : 0;

      const priceErrors = allValidated
        .filter((p) => p.priceErrorPercent !== null)
        .map((p) => Number(p.priceErrorPercent));
      const avgPriceError = priceErrors.length > 0
        ? priceErrors.reduce((sum, e) => sum + e, 0) / priceErrors.length
        : 0;

      const tradingReturns = allValidated
        .filter((p) => p.tradingReturn !== null)
        .map((p) => Number(p.tradingReturn));
      const avgTradingReturn = tradingReturns.length > 0
        ? tradingReturns.reduce((sum, r) => sum + r, 0) / tradingReturns.length
        : 0;

      // Accuracy by stock
      const byStockData = await prisma.prediction.groupBy({
        by: ['companyId'],
        where: {
          isCorrect: { not: null },
        },
        _count: {
          id: true,
        },
      });

      const byStock = await Promise.all(
        byStockData.map(async (item) => {
          const company = await prisma.company.findUnique({
            where: { id: item.companyId },
          });

          const stockPredictions = await prisma.prediction.findMany({
            where: {
              companyId: item.companyId,
              isCorrect: { not: null },
            },
          });

          const correct = stockPredictions.filter((p) => p.isCorrect).length;
          const accuracy = item._count.id > 0 ? (correct / item._count.id) * 100 : 0;

          // Enhanced metrics for this stock
          const stockConfidenceScore = stockPredictions.reduce(
            (sum, p) => sum + (Number(p.confidenceWeightedScore) || 0),
            0
          );
          const stockConfidenceWeightedAccuracy = stockPredictions.length > 0
            ? (stockConfidenceScore / stockPredictions.length) * 100
            : 0;

          const stockPriceErrors = stockPredictions
            .filter((p) => p.priceErrorPercent !== null)
            .map((p) => Number(p.priceErrorPercent));
          const stockAvgPriceError = stockPriceErrors.length > 0
            ? stockPriceErrors.reduce((sum, e) => sum + e, 0) / stockPriceErrors.length
            : 0;

          const stockTradingReturns = stockPredictions
            .filter((p) => p.tradingReturn !== null)
            .map((p) => Number(p.tradingReturn));
          const stockAvgTradingReturn = stockTradingReturns.length > 0
            ? stockTradingReturns.reduce((sum, r) => sum + r, 0) / stockTradingReturns.length
            : 0;

          return {
            ticker: company?.ticker || 'Unknown',
            name: company?.name || 'Unknown',
            total: item._count.id,
            correct,
            accuracy: parseFloat(accuracy.toFixed(2)),
            confidenceWeightedAccuracy: parseFloat(stockConfidenceWeightedAccuracy.toFixed(2)),
            avgPriceError: parseFloat(stockAvgPriceError.toFixed(2)),
            avgTradingReturn: parseFloat(stockAvgTradingReturn.toFixed(2)),
          };
        })
      );

      // Accuracy by model
      const byModelData = await prisma.prediction.groupBy({
        by: ['modelId'],
        where: {
          isCorrect: { not: null },
          modelId: { not: null },
        },
        _count: {
          id: true,
        },
      });

      const byModel = await Promise.all(
        byModelData.map(async (item) => {
          if (!item.modelId) return null;

          const model = await prisma.mlModel.findUnique({
            where: { id: item.modelId },
          });

          const modelPredictions = await prisma.prediction.findMany({
            where: {
              modelId: item.modelId,
              isCorrect: { not: null },
            },
          });

          const correct = modelPredictions.filter((p) => p.isCorrect).length;
          const accuracy = item._count.id > 0 ? (correct / item._count.id) * 100 : 0;

          // Enhanced metrics for this model
          const modelConfidenceScore = modelPredictions.reduce(
            (sum, p) => sum + (Number(p.confidenceWeightedScore) || 0),
            0
          );
          const modelConfidenceWeightedAccuracy = modelPredictions.length > 0
            ? (modelConfidenceScore / modelPredictions.length) * 100
            : 0;

          return {
            modelId: item.modelId,
            modelName: model?.name || 'Unknown',
            total: item._count.id,
            correct,
            accuracy: parseFloat(accuracy.toFixed(2)),
            confidenceWeightedAccuracy: parseFloat(modelConfidenceWeightedAccuracy.toFixed(2)),
          };
        })
      ).then((results) => results.filter((r) => r !== null) as any[]);

      return {
        overall: {
          total: totalValidated,
          correct: totalCorrect,
          accuracy: parseFloat(overallAccuracy.toFixed(2)),
          confidenceWeightedAccuracy: parseFloat(confidenceWeightedAccuracy.toFixed(2)),
          avgPriceError: parseFloat(avgPriceError.toFixed(2)),
          avgTradingReturn: parseFloat(avgTradingReturn.toFixed(2)),
        },
        byStock,
        byModel,
      };
    } catch (error: any) {
      logger.error('Error getting accuracy stats:', error);
      throw error;
    }
  }
}

export const predictionValidationJob = new PredictionValidationJob();
