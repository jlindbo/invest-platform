import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import ComparisonCard from './ComparisonCard';
import { api, LiveComparison } from '../../services/api';

const LiveComparisonWidget = () => {
  const [comparisons, setComparisons] = useState<LiveComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [marketOpen, setMarketOpen] = useState(false);
  const [nextUpdate, setNextUpdate] = useState<string>('');
  const [fromCache, setFromCache] = useState(false);

  // Smart polling interval based on market status
  const pollingInterval = marketOpen ? 120000 : 1800000; // 2 min vs 30 min

  const fetchComparison = async () => {
    try {
      setError(null);
      const data = await api.getLiveComparison();

      if (data.success) {
        setComparisons(data.comparisons);
        setMarketOpen(data.marketOpen);
        setNextUpdate(data.nextUpdate);
        setFromCache(data.fromCache);
        setLastUpdate(new Date());
      }
    } catch (err: any) {
      console.error('Error fetching live comparison:', err);
      setError('Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparison();

    // Set up smart polling
    const interval = setInterval(fetchComparison, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval]);

  // Calculate overall accuracy
  const overallAccuracy = comparisons.length > 0
    ? ((comparisons.filter(c => c.directionCorrect).length / comparisons.length) * 100).toFixed(1)
    : '0';

  const correctCount = comparisons.filter(c => c.directionCorrect).length;
  const wrongCount = comparisons.filter(c => c.directionCorrect === false).length;
  const avgError = comparisons.length > 0
    ? comparisons.reduce((sum, c) => sum + Math.abs(c.changeError || 0), 0) / comparisons.length
    : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center text-red-600 py-8">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header with market status */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Live Prediction Accuracy
          </h2>
          <div className="flex items-center gap-3">
            <MarketStatusBadge isOpen={marketOpen} />
            {fromCache && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Cached data
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-blue-600">{overallAccuracy}%</div>
          <div className="text-xs text-gray-500">Direction Accuracy</div>
        </div>
      </div>

      {/* Comparison cards grid */}
      {comparisons.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {comparisons.map((comp) => (
            <ComparisonCard key={comp.ticker} comparison={comp} />
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8">
          No comparison data available
        </div>
      )}

      {/* Summary stats */}
      {comparisons.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6 text-center">
          <StatCard value={correctCount} label="Correct" color="green" />
          <StatCard value={wrongCount} label="Wrong" color="red" />
          <StatCard value={`${avgError.toFixed(2)}%`} label="Avg Error" color="gray" />
        </div>
      )}

      {/* Footer with timestamps */}
      <div className="pt-4 border-t border-gray-200 flex justify-between text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Last updated: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </div>
        {nextUpdate && !marketOpen && (
          <div>Next update: {format(new Date(nextUpdate), 'PPp')}</div>
        )}
      </div>
    </div>
  );
};

// Market status badge component
const MarketStatusBadge: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
    isOpen ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
  }`}>
    <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
    {isOpen ? 'Market Open' : 'Market Closed'}
  </div>
);

// Stat card component
const StatCard: React.FC<{ value: number | string; label: string; color: string }> = ({ value, label, color }) => {
  const colorClasses = {
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className={`text-3xl font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
};

export default LiveComparisonWidget;
