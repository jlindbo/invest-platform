import axios, { AxiosInstance } from 'axios';
import config from '../config/app';
import logger from '../utils/logger';

interface SentimentResult {
  score: number;
  label: string;
  confidence: number;
}

interface PredictionResult {
  success: boolean;
  ticker: string;
  prediction_id?: number;
  prediction_date?: string;
  target_date?: string;
  current_price?: number;
  predicted_direction?: string;
  direction_probability?: number;
  predicted_price?: number;
  predicted_change_percent?: number;
  confidence?: number;
  error?: string;
}

/**
 * Client for communicating with ML Service
 */
class MLClientService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.mlService.url;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds for ML operations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Log requests in development
    if (config.env === 'development') {
      this.client.interceptors.request.use((request) => {
        logger.debug(`ML Service Request: ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      });
    }
  }

  /**
   * Check if ML service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error('ML Service health check failed:', error);
      return false;
    }
  }

  /**
   * Analyze sentiment of text (Norwegian)
   */
  async analyzeSentiment(text: string): Promise<SentimentResult | null> {
    try {
      const response = await this.client.post('/api/v1/sentiment/analyze', {
        text,
      });

      if (response.data.success) {
        return response.data.sentiment;
      }

      return null;
    } catch (error: any) {
      logger.error('Sentiment analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Analyze sentiment for multiple texts
   */
  async analyzeSentimentBatch(texts: string[]): Promise<SentimentResult[]> {
    try {
      const response = await this.client.post('/api/v1/sentiment/batch', {
        texts,
      });

      if (response.data.success) {
        return response.data.sentiments;
      }

      return [];
    } catch (error: any) {
      logger.error('Batch sentiment analysis failed:', error.message);
      return [];
    }
  }

  /**
   * Update sentiment for articles without sentiment scores
   */
  async updateArticleSentiments(limit: number = 100): Promise<number> {
    try {
      const response = await this.client.post(
        `/api/v1/sentiment/update-articles?limit=${limit}`
      );

      if (response.data.success) {
        return response.data.updated_count;
      }

      return 0;
    } catch (error: any) {
      logger.error('Update article sentiments failed:', error.message);
      return 0;
    }
  }

  /**
   * Get prediction for a single stock
   */
  async predictSingle(ticker: string): Promise<PredictionResult> {
    try {
      logger.info(`Requesting prediction for ${ticker}`);

      const response = await this.client.post('/api/v1/predict/single', {
        ticker,
      });

      return response.data;
    } catch (error: any) {
      logger.error(`Prediction failed for ${ticker}:`, error.message);
      return {
        success: false,
        ticker,
        error: error.message,
      };
    }
  }

  /**
   * Get predictions for multiple stocks
   */
  async predictBatch(tickers: string[]): Promise<PredictionResult[]> {
    try {
      logger.info(`Requesting predictions for ${tickers.length} stocks`);

      const response = await this.client.post('/api/v1/predict/batch', {
        tickers,
      });

      if (response.data.success) {
        return response.data.predictions;
      }

      return [];
    } catch (error: any) {
      logger.error('Batch prediction failed:', error.message);
      return [];
    }
  }

  /**
   * Train LSTM model for a ticker
   */
  async trainModel(ticker: string, epochs?: number): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      logger.info(`Requesting model training for ${ticker}`);

      const response = await this.client.post('/api/v1/train/lstm', {
        ticker,
        epochs,
      });

      return {
        success: response.data.success,
        message: response.data.message,
      };
    } catch (error: any) {
      logger.error(`Training request failed for ${ticker}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get training status for a ticker
   */
  async getTrainingStatus(ticker: string): Promise<{
    success: boolean;
    has_model: boolean;
    model?: any;
    error?: string;
  }> {
    try {
      const response = await this.client.get(`/api/v1/train/status/${ticker}`);

      return {
        success: response.data.success,
        has_model: response.data.has_model,
        model: response.data.model,
      };
    } catch (error: any) {
      logger.error(`Get training status failed for ${ticker}:`, error.message);
      return {
        success: false,
        has_model: false,
        error: error.message,
      };
    }
  }

  /**
   * Get prediction history for a ticker
   */
  async getPredictionHistory(ticker: string, limit: number = 30): Promise<any[]> {
    try {
      const response = await this.client.get(`/api/v1/predict/history/${ticker}`, {
        params: { limit },
      });

      if (response.data.success) {
        return response.data.predictions;
      }

      return [];
    } catch (error: any) {
      logger.error(`Get prediction history failed for ${ticker}:`, error.message);
      return [];
    }
  }
}

export default new MLClientService();
