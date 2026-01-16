import { Stock, Prediction } from '../../services/api';

interface StockCardProps {
  stock: Stock;
  prediction?: Prediction;
}

export function StockCard({ stock, prediction }: StockCardProps) {
  const priceChange = prediction?.predictedChangePercent || 0;
  const isPositive = priceChange > 0;
  const confidence = prediction?.confidence || 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{stock.ticker}</h3>
          <p className="text-sm text-gray-600">{stock.name}</p>
        </div>
        {stock.latestPrice && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">
              {stock.latestPrice.close.toFixed(2)} NOK
            </p>
            <p className="text-xs text-gray-500">
              Vol: {(stock.latestPrice.volume / 1000000).toFixed(2)}M
            </p>
          </div>
        )}
      </div>

      {prediction && (
        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Prediction</span>
            <span className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '↑' : '↓'} {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>

          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">Target Price</span>
            <span className="text-sm font-semibold text-gray-900">
              {prediction.predictedPrice.toFixed(2)} NOK
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Confidence</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    confidence > 0.6 ? 'bg-green-500' : confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${confidence * 100}%` }}
                ></div>
              </div>
              <span className="text-xs font-medium text-gray-700">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Target: {new Date(prediction.targetDate).toLocaleDateString('nb-NO')}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Sector:</span>
            <p className="font-medium text-gray-700">{stock.sector}</p>
          </div>
          <div>
            <span className="text-gray-500">Industry:</span>
            <p className="font-medium text-gray-700 truncate">{stock.industry}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
