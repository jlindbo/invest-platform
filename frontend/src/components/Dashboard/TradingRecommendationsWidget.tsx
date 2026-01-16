import { TradingRecommendation } from '../../services/api';

interface TradingRecommendationsWidgetProps {
  recommendations: TradingRecommendation[];
}

export function TradingRecommendationsWidget({ recommendations }: TradingRecommendationsWidgetProps) {
  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'SHORT':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'HOLD':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return '📈';
      case 'SHORT':
        return '📉';
      case 'HOLD':
        return '⏸️';
      default:
        return '❓';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('no-NO', {
      style: 'currency',
      currency: 'NOK',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <span className="mr-2">🎯</span>
        Trading Recommendations
      </h3>

      {recommendations.length > 0 ? (
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <div
              key={rec.ticker}
              className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getRecommendationIcon(rec.recommendation)}</span>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{rec.ticker}</p>
                    <p className="text-xs text-gray-600">{rec.companyName}</p>
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded-full border-2 font-bold text-sm ${getRecommendationBadge(
                    rec.recommendation
                  )}`}
                >
                  {rec.recommendation}
                </div>
              </div>

              {/* Price Info */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-blue-50 border border-blue-200 rounded p-2">
                  <p className="text-xs text-blue-900 font-medium">Current Price</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(rec.currentPrice)}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded p-2">
                  <p className="text-xs text-purple-900 font-medium">Predicted Price</p>
                  <p className="text-lg font-bold text-purple-600">
                    {formatCurrency(rec.predictedPrice)}
                  </p>
                </div>
              </div>

              {/* Confidence & Target Date */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Confidence:</span>
                  <span className={`text-sm font-bold ${getConfidenceColor(rec.confidence)}`}>
                    {(rec.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Target:</span>
                  <span className="text-sm font-semibold text-gray-700">
                    {new Date(rec.targetDate).toLocaleDateString('no-NO', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-gray-50 border border-gray-200 rounded p-2">
                <p className="text-xs font-medium text-gray-700 mb-1">Analysis:</p>
                <p className="text-xs text-gray-600">{rec.reasoning}</p>
              </div>

              {/* Expected Return */}
              {rec.predictedPrice && rec.currentPrice && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Expected Return:</span>
                    <span
                      className={`text-sm font-bold ${
                        rec.predictedPrice > rec.currentPrice
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {rec.predictedPrice > rec.currentPrice ? '+' : ''}
                      {(
                        ((rec.predictedPrice - rec.currentPrice) / rec.currentPrice) *
                        100
                      ).toFixed(2)}
                      %
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-gray-600 text-sm font-medium">No recommendations available</p>
          <p className="text-gray-500 text-xs mt-1">
            Check back daily at 6:30 AM for new trading signals
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-blue-600 text-sm">ℹ️</span>
          <div>
            <p className="text-xs font-medium text-blue-900">How to Use</p>
            <p className="text-xs text-blue-700 mt-1">
              Recommendations are based on high-confidence predictions (60%+). Always do your own
              research before trading. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>

      {/* Risk Warning */}
      {recommendations.length > 0 && (
        <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-orange-600 text-sm">⚠️</span>
            <div>
              <p className="text-xs font-medium text-orange-900">Risk Warning</p>
              <p className="text-xs text-orange-700 mt-1">
                Never invest more than you can afford to lose. Consider using stop-losses and
                position sizing based on your risk tolerance.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
