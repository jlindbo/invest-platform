import prisma from '../config/database';
import logger from '../utils/logger';

export interface TradingStrategy {
  minConfidence: number; // Only trade if confidence > this threshold
  positionSize: number; // Amount to invest per trade (NOK)
  maxPositionsPerStock: number; // Max concurrent positions per stock
  stopLoss?: number; // Stop loss percentage
  takeProfit?: number; // Take profit percentage
}

export interface TradingSimulationResult {
  summary: {
    startingCapital: number;
    currentCapital: number;
    totalReturn: number;
    totalReturnPercent: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWinAmount: number;
    avgLossAmount: number;
    largestWin: number;
    largestLoss: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  byStock: Array<{
    ticker: string;
    name: string;
    trades: number;
    winRate: number;
    totalReturn: number;
    avgReturn: number;
  }>;
  trades: Array<{
    date: string;
    ticker: string;
    type: 'BUY' | 'SELL' | 'SHORT';
    confidence: number;
    entryPrice: number;
    exitPrice: number;
    return: number;
    returnPercent: number;
  }>;
}

/**
 * Trading Simulator Service
 * Simulates trading based on ML predictions to evaluate real-world performance
 */
export class TradingSimulatorService {
  private readonly DEFAULT_STRATEGY: TradingStrategy = {
    minConfidence: 0.55, // Only trade if confidence > 55%
    positionSize: 10000, // 10,000 NOK per trade
    maxPositionsPerStock: 1, // One position at a time per stock
  };

  /**
   * Run a backtest simulation on historical predictions
   */
  async simulateHistoricalTrading(
    strategy: TradingStrategy = this.DEFAULT_STRATEGY
  ): Promise<TradingSimulationResult> {
    try {
      logger.info('Starting trading simulation with strategy:', strategy);

      // Get all validated predictions with actual outcomes
      const predictions = await prisma.prediction.findMany({
        where: {
          isCorrect: { not: null },
          confidence: { gte: strategy.minConfidence },
        },
        include: {
          company: true,
        },
        orderBy: {
          targetDate: 'asc',
        },
      });

      logger.info(`Found ${predictions.length} predictions meeting criteria`);

      const startingCapital = 100000; // Start with 100,000 NOK
      let currentCapital = startingCapital;
      const trades: any[] = [];
      const openPositions: Map<number, any> = new Map(); // companyId -> position

      for (const prediction of predictions) {
        const companyId = prediction.companyId;
        const confidence = Number(prediction.confidence);

        // Check if we already have an open position for this stock
        if (openPositions.has(companyId)) {
          continue; // Skip if position already open
        }

        // Check if we have enough capital
        const positionSize = strategy.positionSize;
        if (currentCapital < positionSize) {
          continue; // Not enough capital
        }

        // Execute trade based on prediction
        const entryPrice = Number(prediction.actualPrice) || 0;
        let exitPrice = entryPrice;
        let tradeReturn = 0;
        let returnPercent = 0;

        if (prediction.actualDirection === 'up' && prediction.predictedDirection === 'up') {
          // Successful UP prediction - simulate buying
          const previousPrice = entryPrice / (1 + Number(prediction.actualChangePercent) / 100);
          const shares = positionSize / previousPrice;
          tradeReturn = shares * (entryPrice - previousPrice);
          returnPercent = (tradeReturn / positionSize) * 100;
          exitPrice = entryPrice;

          trades.push({
            date: prediction.targetDate,
            ticker: prediction.company.ticker,
            type: 'BUY',
            confidence,
            entryPrice: previousPrice,
            exitPrice,
            return: tradeReturn - (positionSize * 0.002), // 0.2% fees
            returnPercent: returnPercent - 0.2,
          });

          currentCapital += tradeReturn - (positionSize * 0.002);
        } else if (
          prediction.actualDirection === 'down' &&
          prediction.predictedDirection === 'down'
        ) {
          // Successful DOWN prediction - simulate shorting
          const previousPrice = entryPrice / (1 + Number(prediction.actualChangePercent) / 100);
          const shares = positionSize / previousPrice;
          tradeReturn = shares * (previousPrice - entryPrice);
          returnPercent = (tradeReturn / positionSize) * 100;

          trades.push({
            date: prediction.targetDate,
            ticker: prediction.company.ticker,
            type: 'SHORT',
            confidence,
            entryPrice: previousPrice,
            exitPrice: entryPrice,
            return: tradeReturn - (positionSize * 0.002),
            returnPercent: returnPercent - 0.2,
          });

          currentCapital += tradeReturn - (positionSize * 0.002);
        } else {
          // Wrong prediction - simulate loss
          const actualChangePercent = Number(prediction.actualChangePercent);
          const previousPrice = entryPrice / (1 + actualChangePercent / 100);

          if (prediction.predictedDirection === 'up') {
            // Predicted up but went down/flat - loss
            const shares = positionSize / previousPrice;
            tradeReturn = shares * (entryPrice - previousPrice);
            returnPercent = (tradeReturn / positionSize) * 100;

            trades.push({
              date: prediction.targetDate,
              ticker: prediction.company.ticker,
              type: 'BUY',
              confidence,
              entryPrice: previousPrice,
              exitPrice: entryPrice,
              return: tradeReturn - (positionSize * 0.002),
              returnPercent: returnPercent - 0.2,
            });

            currentCapital += tradeReturn - (positionSize * 0.002);
          } else {
            // Predicted down but went up/flat - loss on short
            const shares = positionSize / previousPrice;
            tradeReturn = shares * (previousPrice - entryPrice);
            returnPercent = (tradeReturn / positionSize) * 100;

            trades.push({
              date: prediction.targetDate,
              ticker: prediction.company.ticker,
              type: 'SHORT',
              confidence,
              entryPrice: previousPrice,
              exitPrice: entryPrice,
              return: tradeReturn - (positionSize * 0.002),
              returnPercent: returnPercent - 0.2,
            });

            currentCapital += tradeReturn - (positionSize * 0.002);
          }
        }
      }

      // Calculate summary statistics
      const totalReturn = currentCapital - startingCapital;
      const totalReturnPercent = (totalReturn / startingCapital) * 100;
      const winningTrades = trades.filter((t) => t.return > 0);
      const losingTrades = trades.filter((t) => t.return <= 0);
      const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

      const avgWinAmount =
        winningTrades.length > 0
          ? winningTrades.reduce((sum, t) => sum + t.return, 0) / winningTrades.length
          : 0;
      const avgLossAmount =
        losingTrades.length > 0
          ? losingTrades.reduce((sum, t) => sum + t.return, 0) / losingTrades.length
          : 0;

      const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.return)) : 0;
      const largestLoss =
        losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.return)) : 0;

      // Calculate Sharpe Ratio (simplified)
      const returns = trades.map((t) => t.returnPercent);
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      );
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Calculate maximum drawdown
      let peak = startingCapital;
      let maxDrawdown = 0;
      let runningCapital = startingCapital;

      for (const trade of trades) {
        runningCapital += trade.return;
        if (runningCapital > peak) {
          peak = runningCapital;
        }
        const drawdown = ((peak - runningCapital) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      // Group by stock
      const byStockMap = new Map<string, any>();
      for (const trade of trades) {
        if (!byStockMap.has(trade.ticker)) {
          byStockMap.set(trade.ticker, {
            ticker: trade.ticker,
            name: trade.ticker,
            trades: 0,
            wins: 0,
            totalReturn: 0,
          });
        }
        const stockData = byStockMap.get(trade.ticker);
        stockData.trades++;
        if (trade.return > 0) stockData.wins++;
        stockData.totalReturn += trade.return;
      }

      const byStock = Array.from(byStockMap.values()).map((s) => ({
        ticker: s.ticker,
        name: s.name,
        trades: s.trades,
        winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
        totalReturn: parseFloat(s.totalReturn.toFixed(2)),
        avgReturn: s.trades > 0 ? parseFloat((s.totalReturn / s.trades).toFixed(2)) : 0,
      }));

      const result: TradingSimulationResult = {
        summary: {
          startingCapital,
          currentCapital: parseFloat(currentCapital.toFixed(2)),
          totalReturn: parseFloat(totalReturn.toFixed(2)),
          totalReturnPercent: parseFloat(totalReturnPercent.toFixed(2)),
          totalTrades: trades.length,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          winRate: parseFloat(winRate.toFixed(2)),
          avgWinAmount: parseFloat(avgWinAmount.toFixed(2)),
          avgLossAmount: parseFloat(avgLossAmount.toFixed(2)),
          largestWin: parseFloat(largestWin.toFixed(2)),
          largestLoss: parseFloat(largestLoss.toFixed(2)),
          sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
          maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        },
        byStock,
        trades: trades.map((t) => ({
          ...t,
          date: t.date.toISOString().split('T')[0],
          return: parseFloat(t.return.toFixed(2)),
          returnPercent: parseFloat(t.returnPercent.toFixed(2)),
          entryPrice: parseFloat(t.entryPrice.toFixed(2)),
          exitPrice: parseFloat(t.exitPrice.toFixed(2)),
        })),
      };

      logger.info('Trading simulation completed:', result.summary);

      return result;
    } catch (error: any) {
      logger.error('Trading simulation failed:', error);
      throw error;
    }
  }

  /**
   * Get trading recommendations for active predictions
   */
  async getTradingRecommendations(
    minConfidence: number = 0.60
  ): Promise<Array<{
    ticker: string;
    companyName: string;
    recommendation: 'BUY' | 'SHORT' | 'HOLD';
    confidence: number;
    predictedDirection: string;
    predictedPrice: number;
    currentPrice: number;
    targetDate: string;
    reasoning: string;
  }>> {
    try {
      // Get latest predictions for target stocks
      const predictions = await prisma.prediction.findMany({
        where: {
          targetDate: { gte: new Date() },
          confidence: { gte: minConfidence },
          isCorrect: null, // Not yet validated
        },
        include: {
          company: {
            include: {
              stockPrices: {
                orderBy: { date: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          confidence: 'desc',
        },
      });

      const recommendations = predictions.map((p) => {
        const confidence = Number(p.confidence);
        const currentPrice = p.company.stockPrices[0]
          ? Number(p.company.stockPrices[0].close)
          : 0;

        let recommendation: 'BUY' | 'SHORT' | 'HOLD' = 'HOLD';
        let reasoning = '';

        if (confidence >= 0.70) {
          recommendation = p.predictedDirection === 'up' ? 'BUY' : 'SHORT';
          reasoning = `High confidence (${(confidence * 100).toFixed(1)}%) ${p.predictedDirection} prediction. Strong trading signal.`;
        } else if (confidence >= 0.60) {
          recommendation = p.predictedDirection === 'up' ? 'BUY' : 'SHORT';
          reasoning = `Moderate confidence (${(confidence * 100).toFixed(1)}%) ${p.predictedDirection} prediction. Consider smaller position.`;
        } else {
          recommendation = 'HOLD';
          reasoning = `Low confidence (${(confidence * 100).toFixed(1)}%). Wait for stronger signal.`;
        }

        return {
          ticker: p.company.ticker,
          companyName: p.company.name,
          recommendation,
          confidence,
          predictedDirection: p.predictedDirection,
          predictedPrice: Number(p.predictedPrice) || 0,
          currentPrice,
          targetDate: p.targetDate.toISOString().split('T')[0],
          reasoning,
        };
      });

      return recommendations;
    } catch (error: any) {
      logger.error('Error getting trading recommendations:', error);
      throw error;
    }
  }
}

export const tradingSimulatorService = new TradingSimulatorService();
export default tradingSimulatorService;
