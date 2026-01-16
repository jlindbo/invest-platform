const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface Stock {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  isTarget: boolean;
  latestPrice?: {
    date: string;
    close: number;
    volume: number;
  };
}

export interface Prediction {
  id: number;
  ticker: string;
  companyName: string;
  predictionDate: string;
  targetDate: string;
  predictedDirection: 'up' | 'down';
  confidence: number;
  predictedPrice: number;
  predictedChangePercent: number;
  actualDirection?: string;
  actualPrice?: number;
  isCorrect?: boolean;
  modelVersion: string;
}

export interface StockPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose: number;
}

export interface TechnicalIndicator {
  date: string;
  rsi14: number;
  macd: number;
  macdSignal: number;
  sma20: number;
  sma50: number;
  sma200: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
}

export interface AccuracyStats {
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
}

export interface TradingSimulation {
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
    type: string;
    confidence: number;
    entryPrice: number;
    exitPrice: number;
    return: number;
    returnPercent: number;
  }>;
}

export interface TradingRecommendation {
  ticker: string;
  companyName: string;
  recommendation: 'BUY' | 'SHORT' | 'HOLD';
  confidence: number;
  predictedDirection: string;
  predictedPrice: number;
  currentPrice: number;
  targetDate: string;
  reasoning: string;
}

export interface LiveComparison {
  ticker: string;
  companyName: string;
  currentPrice: number;
  currentChange: number | null;
  currentDirection: 'up' | 'down' | null;
  predictedPrice: number | null;
  predictedChange: number | null;
  predictedDirection: string | null;
  confidence: number | null;
  priceError: number | null;
  changeError: number | null;
  directionCorrect: boolean | null;
  errorCategory: 'excellent' | 'good' | 'poor' | null;
  errorBadge: {
    color: 'green' | 'yellow' | 'red' | 'gray';
    label: string;
  };
  priceHistory?: Array<{ date: string; close: number }>;
  targetDate: string;
  lastUpdated: string;
}

export interface LiveComparisonResponse {
  success: boolean;
  count: number;
  comparisons: LiveComparison[];
  lastUpdated: string;
  marketOpen: boolean;
  nextUpdate: string;
  fromCache: boolean;
}

export const api = {
  async getStocks(): Promise<Stock[]> {
    const response = await fetch(`${API_BASE_URL}/stocks`);
    const data = await response.json();
    return data.stocks || [];
  },

  async getLatestPredictions(): Promise<Prediction[]> {
    const response = await fetch(`${API_BASE_URL}/predictions/latest`);
    const data = await response.json();
    return data.predictions || [];
  },

  async getStockPrices(ticker: string, limit: number = 30): Promise<StockPrice[]> {
    const response = await fetch(`${API_BASE_URL}/stocks/${ticker}/prices?limit=${limit}`);
    const data = await response.json();
    return data.prices || [];
  },

  async getTechnicalIndicators(ticker: string, limit: number = 30): Promise<TechnicalIndicator[]> {
    const response = await fetch(`${API_BASE_URL}/stocks/${ticker}/indicators?limit=${limit}`);
    const data = await response.json();
    return data.indicators || [];
  },

  async getAccuracyStats(): Promise<AccuracyStats> {
    const response = await fetch(`${API_BASE_URL}/analytics/accuracy`);
    const data = await response.json();
    return data.stats;
  },

  async getTradingSimulation(minConfidence: number = 0.55): Promise<TradingSimulation> {
    const response = await fetch(`${API_BASE_URL}/analytics/trading-simulation?minConfidence=${minConfidence}`);
    const data = await response.json();
    return data.simulation;
  },

  async getTradingRecommendations(minConfidence: number = 0.60): Promise<TradingRecommendation[]> {
    const response = await fetch(`${API_BASE_URL}/analytics/trading-recommendations?minConfidence=${minConfidence}`);
    const data = await response.json();
    return data.recommendations || [];
  },

  async getLiveComparison(): Promise<LiveComparisonResponse> {
    const response = await fetch(`${API_BASE_URL}/live/comparison`);
    const data = await response.json();
    return data;
  },
};
