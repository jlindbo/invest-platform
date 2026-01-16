import { AccuracyStats } from '../../services/api';

interface AccuracyWidgetProps {
  stats: AccuracyStats;
}

export function AccuracyWidget({ stats }: AccuracyWidgetProps) {
  const { overall, byStock } = stats;

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 60) return 'text-green-600';
    if (accuracy >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyBgColor = (accuracy: number) => {
    if (accuracy >= 60) return 'bg-green-50 border-green-300';
    if (accuracy >= 50) return 'bg-yellow-50 border-yellow-300';
    return 'bg-red-50 border-red-300';
  };

  const getReturnColor = (returnVal: number) => {
    if (returnVal > 1) return 'text-green-600';
    if (returnVal > 0) return 'text-green-500';
    if (returnVal === 0) return 'text-gray-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <span className="mr-2">📊</span>
        Performance Metrics
      </h3>

      {/* Overall Accuracy - Main Card */}
      <div className={`border-2 rounded-lg p-4 mb-4 ${getAccuracyBgColor(overall.accuracy)}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Basic Accuracy</p>
            <p className="text-xs text-gray-600">
              {overall.correct} / {overall.total} predictions
            </p>
          </div>
          <div className={`text-3xl font-bold ${getAccuracyColor(overall.accuracy)}`}>
            {overall.accuracy.toFixed(1)}%
          </div>
        </div>

        {/* Progress bar */}
        {overall.total > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                overall.accuracy >= 60
                  ? 'bg-green-500'
                  : overall.accuracy >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(overall.accuracy, 100)}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Enhanced Metrics Grid */}
      {overall.total > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Confidence-Weighted Accuracy */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-900 mb-1">True Skill</p>
            <p className={`text-2xl font-bold ${getAccuracyColor(overall.confidenceWeightedAccuracy)}`}>
              {overall.confidenceWeightedAccuracy.toFixed(1)}%
            </p>
            <p className="text-xs text-blue-700 mt-1">Confidence-weighted</p>
          </div>

          {/* Avg Trading Return */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs font-medium text-purple-900 mb-1">Avg Return</p>
            <p className={`text-2xl font-bold ${getReturnColor(overall.avgTradingReturn)}`}>
              {overall.avgTradingReturn > 0 ? '+' : ''}
              {overall.avgTradingReturn.toFixed(2)}%
            </p>
            <p className="text-xs text-purple-700 mt-1">Per trade</p>
          </div>

          {/* Avg Price Error */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-xs font-medium text-orange-900 mb-1">Price Error</p>
            <p className="text-2xl font-bold text-orange-600">
              {overall.avgPriceError.toFixed(1)}%
            </p>
            <p className="text-xs text-orange-700 mt-1">MAPE</p>
          </div>

          {/* Total Predictions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-900 mb-1">Total Validated</p>
            <p className="text-2xl font-bold text-gray-700">{overall.total}</p>
            <p className="text-xs text-gray-600 mt-1">Predictions</p>
          </div>
        </div>
      )}

      {/* Per Stock Performance */}
      {byStock.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Per Stock Performance</h4>
          <div className="space-y-3">
            {byStock.map((stock) => (
              <div
                key={stock.ticker}
                className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{stock.ticker}</p>
                    <p className="text-xs text-gray-600">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${getAccuracyColor(stock.accuracy)}`}>
                      {stock.accuracy.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-600">{stock.correct}/{stock.total}</p>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600">True Skill</p>
                    <p className={`text-sm font-semibold ${getAccuracyColor(stock.confidenceWeightedAccuracy)}`}>
                      {stock.confidenceWeightedAccuracy.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Avg Return</p>
                    <p className={`text-sm font-semibold ${getReturnColor(stock.avgTradingReturn)}`}>
                      {stock.avgTradingReturn > 0 ? '+' : ''}{stock.avgTradingReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Price Error</p>
                    <p className="text-sm font-semibold text-orange-600">
                      {stock.avgPriceError.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Trading Signal */}
                {stock.avgTradingReturn > 0.5 && stock.accuracy >= 50 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                    <span>✓</span>
                    <span>Good trading candidate</span>
                  </div>
                )}
                {stock.avgTradingReturn < 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-1 rounded">
                    <span>✗</span>
                    <span>Avoid trading for now</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {overall.total === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-gray-600 text-sm font-medium">No validated predictions yet</p>
          <p className="text-gray-500 text-xs mt-1">
            Predictions validate daily at 7 AM after target dates pass
          </p>
        </div>
      )}

      {/* Early Stage Warning */}
      {overall.total > 0 && overall.total < 20 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 text-sm">ℹ️</span>
            <div>
              <p className="text-xs font-medium text-blue-900">Early Stage Data</p>
              <p className="text-xs text-blue-700 mt-1">
                Only {overall.total} predictions validated. Metrics will stabilize after 20+ predictions.
                Model retrains Sunday when accuracy &lt; 50%.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {overall.total > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-700 mb-2">Metric Explanations:</p>
          <div className="space-y-1 text-xs text-gray-600">
            <p><strong>True Skill:</strong> Confidence-weighted accuracy (rewards high-confidence correct predictions)</p>
            <p><strong>Avg Return:</strong> Simulated trading return per prediction (includes 0.2% fees)</p>
            <p><strong>Price Error:</strong> Average price prediction error (MAPE)</p>
          </div>
        </div>
      )}
    </div>
  );
}
