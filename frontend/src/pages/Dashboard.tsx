import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { StockCard } from '../components/Dashboard/StockCard';
import { AccuracyWidget } from '../components/Dashboard/AccuracyWidget';
import { TradingSimulatorWidget } from '../components/Dashboard/TradingSimulatorWidget';
import { TradingRecommendationsWidget } from '../components/Dashboard/TradingRecommendationsWidget';
import LiveComparisonWidget from '../components/Dashboard/LiveComparisonWidget';

export function Dashboard() {
  const { data: stocks, isLoading: loadingStocks } = useQuery({
    queryKey: ['stocks'],
    queryFn: api.getStocks,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: predictions, isLoading: loadingPredictions } = useQuery({
    queryKey: ['predictions'],
    queryFn: api.getLatestPredictions,
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  const { data: accuracyStats, isLoading: loadingAccuracy } = useQuery({
    queryKey: ['accuracy'],
    queryFn: api.getAccuracyStats,
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const { data: tradingSimulation, isLoading: loadingSimulation } = useQuery({
    queryKey: ['tradingSimulation'],
    queryFn: () => api.getTradingSimulation(0.55),
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const { data: recommendations, isLoading: loadingRecommendations } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api.getTradingRecommendations(0.60),
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const targetStocks = stocks?.filter(s => s.isTarget) || [];
  const otherStocks = stocks?.filter(s => !s.isTarget) || [];

  const getPredictionForStock = (ticker: string) => {
    return predictions?.find(p => p.ticker === ticker);
  };

  if (loadingStocks || loadingPredictions) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Target Stocks</p>
              <p className="text-3xl font-bold text-gray-900">{targetStocks.length}</p>
            </div>
            <div className="text-4xl">📊</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Predictions</p>
              <p className="text-3xl font-bold text-gray-900">{predictions?.length || 0}</p>
            </div>
            <div className="text-4xl">🎯</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tracked Stocks</p>
              <p className="text-3xl font-bold text-gray-900">{stocks?.length || 0}</p>
            </div>
            <div className="text-4xl">📈</div>
          </div>
        </div>
      </div>

      {/* Target Stocks and Accuracy Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Target Stocks */}
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Target Stocks with AI Predictions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {targetStocks.map(stock => (
              <StockCard
                key={stock.ticker}
                stock={stock}
                prediction={getPredictionForStock(stock.ticker)}
              />
            ))}
          </div>

          {targetStocks.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800">No target stocks found. Please run data collection.</p>
            </div>
          )}
        </div>

        {/* Accuracy Widget */}
        <div>
          {loadingAccuracy ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 text-sm mt-2">Loading accuracy...</p>
            </div>
          ) : accuracyStats ? (
            <AccuracyWidget stats={accuracyStats} />
          ) : null}
        </div>
      </div>

      {/* Live Comparison Section */}
      <div>
        <LiveComparisonWidget />
      </div>

      {/* Trading Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trading Simulator Widget */}
        <div>
          {loadingSimulation ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 text-sm mt-2">Loading trading simulation...</p>
            </div>
          ) : tradingSimulation ? (
            <TradingSimulatorWidget simulation={tradingSimulation} />
          ) : null}
        </div>

        {/* Trading Recommendations Widget */}
        <div>
          {loadingRecommendations ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 text-sm mt-2">Loading recommendations...</p>
            </div>
          ) : recommendations ? (
            <TradingRecommendationsWidget recommendations={recommendations} />
          ) : null}
        </div>
      </div>

      {/* Other Tracked Stocks */}
      {otherStocks.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Other Tracked Stocks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {otherStocks.map(stock => (
              <div key={stock.ticker} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
                <h3 className="font-bold text-gray-900">{stock.ticker}</h3>
                <p className="text-xs text-gray-600 truncate">{stock.name}</p>
                <p className="text-xs text-gray-500 mt-1">{stock.sector}</p>
                {stock.latestPrice ? (
                  <p className="text-sm font-semibold text-gray-900 mt-2">
                    {stock.latestPrice.close.toFixed(2)} NOK
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">No data</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Status */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">System Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-blue-800">Backend API: Online</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-blue-800">ML Service: Online</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-blue-800">Database: Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-blue-800">LSTM Models: Trained</span>
          </div>
        </div>
      </div>
    </div>
  );
}
