import { TradingSimulation } from '../../services/api';

interface TradingSimulatorWidgetProps {
  simulation: TradingSimulation;
}

export function TradingSimulatorWidget({ simulation }: TradingSimulatorWidgetProps) {
  const { summary, byStock } = simulation;

  const getReturnColor = (returnVal: number) => {
    if (returnVal > 0) return 'text-green-600';
    if (returnVal === 0) return 'text-gray-600';
    return 'text-red-600';
  };

  const getReturnBg = (returnVal: number) => {
    if (returnVal > 0) return 'bg-green-50 border-green-300';
    return 'bg-red-50 border-red-300';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('no-NO', {
      style: 'currency',
      currency: 'NOK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <span className="mr-2">💰</span>
        Trading Simulator
      </h3>

      {/* Main Return Card */}
      <div className={`border-2 rounded-lg p-4 mb-4 ${getReturnBg(summary.totalReturn)}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-gray-700">Total Return</p>
            <p className="text-xs text-gray-600">
              From {formatCurrency(summary.startingCapital)} capital
            </p>
          </div>
          <div className={`text-3xl font-bold ${getReturnColor(summary.totalReturn)}`}>
            {summary.totalReturn > 0 && '+'}
            {formatCurrency(summary.totalReturn)}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Current Capital:</span>
          <span className={`font-semibold ${getReturnColor(summary.totalReturn)}`}>
            {formatCurrency(summary.currentCapital)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-gray-600">Return:</span>
          <span className={`font-semibold ${getReturnColor(summary.totalReturnPercent)}`}>
            {summary.totalReturnPercent > 0 && '+'}
            {summary.totalReturnPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-900 mb-1">Win Rate</p>
          <p className="text-2xl font-bold text-blue-600">{summary.winRate.toFixed(0)}%</p>
          <p className="text-xs text-blue-700 mt-1">
            {summary.winningTrades}/{summary.totalTrades} wins
          </p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs font-medium text-purple-900 mb-1">Sharpe Ratio</p>
          <p className="text-2xl font-bold text-purple-600">{summary.sharpeRatio.toFixed(2)}</p>
          <p className="text-xs text-purple-700 mt-1">Risk-adjusted</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-medium text-green-900 mb-1">Avg Win</p>
          <p className="text-2xl font-bold text-green-600">
            +{formatCurrency(summary.avgWinAmount)}
          </p>
          <p className="text-xs text-green-700 mt-1">Per winning trade</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-medium text-red-900 mb-1">Avg Loss</p>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(summary.avgLossAmount)}
          </p>
          <p className="text-xs text-red-700 mt-1">Per losing trade</p>
        </div>
      </div>

      {/* Performance by Stock */}
      {byStock.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Performance by Stock</h4>
          <div className="space-y-2">
            {byStock
              .sort((a, b) => b.totalReturn - a.totalReturn)
              .map((stock) => (
                <div
                  key={stock.ticker}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{stock.ticker}</p>
                    <p className="text-xs text-gray-600">
                      {stock.trades} trades • {stock.winRate.toFixed(0)}% win rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${getReturnColor(stock.totalReturn)}`}>
                      {stock.totalReturn > 0 && '+'}
                      {formatCurrency(stock.totalReturn)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {stock.avgReturn > 0 && '+'}
                      {stock.avgReturn.toFixed(0)} NOK avg
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Risk Metrics */}
      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-orange-900">Max Drawdown:</span>
          <span className="font-bold text-orange-600">{summary.maxDrawdown.toFixed(2)}%</span>
        </div>
        <p className="text-xs text-orange-700 mt-1">
          Largest peak-to-trough decline
        </p>
      </div>

      {/* Info Box */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-blue-600 text-sm">ℹ️</span>
          <div>
            <p className="text-xs font-medium text-blue-900">Simulation Details</p>
            <p className="text-xs text-blue-700 mt-1">
              Based on historical predictions with 55% min confidence threshold.
              Includes 0.2% transaction fees per trade. Position size: 10,000 NOK.
            </p>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      {summary.totalTrades > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-700 mb-2">Interpretation:</p>
          <div className="space-y-1 text-xs text-gray-600">
            {summary.totalReturnPercent > 5 && (
              <p className="text-green-700">
                ✓ <strong>Profitable strategy:</strong> System shows positive returns. Consider real trading.
              </p>
            )}
            {summary.totalReturnPercent > 0 && summary.totalReturnPercent <= 5 && (
              <p className="text-yellow-700">
                • <strong>Marginally profitable:</strong> Small positive returns. Wait for more data or adjust strategy.
              </p>
            )}
            {summary.totalReturnPercent < 0 && (
              <p className="text-red-700">
                ✗ <strong>Losing strategy:</strong> Negative returns. Wait for model retraining or increase confidence threshold.
              </p>
            )}
            {summary.winRate >= 50 && (
              <p>✓ Win rate {'>'}= 50% is sustainable for profitable trading</p>
            )}
            {summary.sharpeRatio > 1 && (
              <p>✓ Sharpe ratio {'>'}  1 indicates good risk-adjusted returns</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
