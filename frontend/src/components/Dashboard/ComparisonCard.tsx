import React from 'react';
import { CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { LiveComparison } from '../../services/api';

interface ComparisonCardProps {
  comparison: LiveComparison;
}

const ComparisonCard: React.FC<ComparisonCardProps> = ({ comparison }) => {
  return (
    <div className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-gradient-to-br from-white to-gray-50">
      {/* Header: Ticker, name, current price */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-gray-900">{comparison.ticker}</h3>

            {/* Direction correctness icon */}
            {comparison.directionCorrect !== null && (
              comparison.directionCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )
            )}

            {/* Error badge */}
            <ErrorBadge badge={comparison.errorBadge} />
          </div>
          <p className="text-sm text-gray-600 mt-1">{comparison.companyName}</p>
        </div>

        {/* Current price with trend */}
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {comparison.currentPrice.toFixed(2)} NOK
          </div>
          {comparison.currentChange !== null && (
            <div className={`text-sm font-medium flex items-center gap-1 justify-end mt-1 ${
              comparison.currentChange >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {comparison.currentChange >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {comparison.currentChange >= 0 ? '+' : ''}
              {comparison.currentChange.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Sparkline chart */}
      {comparison.priceHistory && comparison.priceHistory.length > 0 && (
        <div className="mb-4 h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparison.priceHistory}>
              <Line
                type="monotone"
                dataKey="close"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Actual vs Predicted grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Actual column */}
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 mb-2">ACTUAL</div>
          <div className="space-y-2">
            <DataRow
              label="Direction"
              value={comparison.currentDirection === 'up' ? '↗ UP' : '↘ DOWN'}
              valueClass={comparison.currentDirection === 'up' ? 'text-green-600' : 'text-red-600'}
            />
            {comparison.currentChange !== null && (
              <DataRow
                label="Change"
                value={`${comparison.currentChange >= 0 ? '+' : ''}${comparison.currentChange.toFixed(2)}%`}
                valueClass={comparison.currentChange >= 0 ? 'text-green-600' : 'text-red-600'}
              />
            )}
          </div>
        </div>

        {/* Predicted column */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="text-xs font-semibold text-blue-700 mb-2">PREDICTED</div>
          <div className="space-y-2">
            <DataRow
              label="Direction"
              value={comparison.predictedDirection === 'up' ? '↗ UP' : '↘ DOWN'}
              valueClass={comparison.predictedDirection === 'up' ? 'text-green-600' : 'text-red-600'}
            />
            {comparison.predictedChange !== null && (
              <DataRow
                label="Change"
                value={`${comparison.predictedChange >= 0 ? '+' : ''}${comparison.predictedChange.toFixed(2)}%`}
                valueClass={comparison.predictedChange >= 0 ? 'text-green-600' : 'text-red-600'}
              />
            )}
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      {comparison.confidence !== null && (
        <div className="mb-3">
          <ConfidenceBar confidence={comparison.confidence} />
        </div>
      )}

      {/* Error metrics footer */}
      <div className="pt-3 border-t border-gray-200 text-xs text-gray-600">
        <div className="flex justify-between items-center">
          <span>Prediction Error</span>
          <span className="font-medium">
            {comparison.priceError !== null
              ? `${comparison.priceError.toFixed(2)}%`
              : 'N/A'
            }
          </span>
        </div>
      </div>
    </div>
  );
};

// Helper components
const DataRow: React.FC<{
  label: string;
  value: string;
  valueClass?: string;
}> = ({ label, value, valueClass }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-gray-600">{label}:</span>
    <span className={`font-medium ${valueClass || 'text-gray-900'}`}>{value}</span>
  </div>
);

const ErrorBadge: React.FC<{
  badge: { color: string; label: string }
}> = ({ badge }) => {
  const colorClasses = {
    green: 'bg-green-100 text-green-800 border-green-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    gray: 'bg-gray-100 text-gray-600 border-gray-300',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
      colorClasses[badge.color as keyof typeof colorClasses] || colorClasses.gray
    }`}>
      {badge.label}
    </span>
  );
};

const ConfidenceBar: React.FC<{ confidence: number }> = ({ confidence }) => {
  const percentage = confidence * 100;
  const color = percentage >= 70 ? 'bg-green-500'
    : percentage >= 50 ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">Confidence</span>
        <span className="font-medium">{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ComparisonCard;
