"""
Inference Engine for Stock Price Predictions
"""
import os
import json
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from loguru import logger
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np

from app.config.settings import settings
from app.preprocessing.enhanced_feature_engineering import EnhancedFeatureEngineer
from app.models.enhanced_lstm_predictor import EnhancedLSTMPredictor, AttentionLayer


class StockPredictor:
    """
    Make predictions using trained LSTM models
    """

    def __init__(self):
        self.feature_engineer = EnhancedFeatureEngineer()
        self.models_cache = {}  # Cache loaded models

    def get_active_model(self, ticker: str) -> Optional[Dict]:
        """
        Get active model metadata for a ticker
        """
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute("""
                SELECT *
                FROM ml_models
                WHERE name = %s AND is_active = true
                ORDER BY training_date DESC
                LIMIT 1
            """, (f'enhanced_lstm_{ticker}',))

            model_info = cursor.fetchone()

            cursor.close()
            conn.close()

            if model_info:
                return dict(model_info)
            return None

        except Exception as e:
            logger.error(f"Error fetching active model: {e}")
            return None

    def load_model(self, ticker: str) -> Optional[EnhancedLSTMPredictor]:
        """
        Load trained enhanced model for a ticker
        """
        # Check cache
        if ticker in self.models_cache:
            logger.info(f"Using cached model for {ticker}")
            return self.models_cache[ticker]

        # Get model metadata
        model_info = self.get_active_model(ticker)
        if not model_info:
            logger.warning(f"No active enhanced model found for {ticker}")
            return None

        # Load model
        model_path = model_info['file_path']
        if not os.path.exists(model_path):
            logger.error(f"Model file not found: {model_path}")
            return None

        try:
            # Get hyperparameters
            hyperparams = model_info.get('hyperparameters', {})
            if isinstance(hyperparams, str):
                hyperparams = json.loads(hyperparams)

            # Create enhanced model instance
            model = EnhancedLSTMPredictor(
                input_shape=(
                    hyperparams.get('lookback_days', settings.lstm_lookback_days),
                    hyperparams.get('n_features', len(hyperparams.get('feature_cols', [])))
                ),
                use_bidirectional=hyperparams.get('use_bidirectional', True),
                use_attention=hyperparams.get('use_attention', True)
            )

            # Load weights
            model.load(model_path)

            # Cache model
            self.models_cache[ticker] = model

            logger.info(f"Enhanced model loaded for {ticker}")
            return model

        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return None

    def predict_next_day(self, ticker: str) -> Dict:
        """
        Predict next day price movement for a ticker

        Returns:
            Dict with prediction details
        """
        try:
            logger.info(f"Making prediction for {ticker}")

            # Load model
            model = self.load_model(ticker)
            if not model:
                return {
                    'success': False,
                    'error': 'No trained model available'
                }

            # Get model info for feature columns
            model_info = self.get_active_model(ticker)
            hyperparams = model_info.get('hyperparameters', {})
            if isinstance(hyperparams, str):
                hyperparams = json.loads(hyperparams)

            # Fetch recent data
            df = self.feature_engineer.fetch_stock_data(ticker)

            if len(df) < settings.lstm_lookback_days:
                return {
                    'success': False,
                    'error': 'Insufficient historical data'
                }

            # Engineer enhanced features
            df = self.feature_engineer.engineer_features(df, ticker)

            # Get feature columns from hyperparameters (use same as training)
            feature_cols = hyperparams.get('feature_cols', None)
            if not feature_cols:
                # Fall back to default enhanced feature columns
                feature_cols = self.feature_engineer.get_feature_columns()

            # Ensure columns exist
            feature_cols = [col for col in feature_cols if col in df.columns]

            # Get most recent sequence
            data = df[feature_cols].values
            if len(data) < settings.lstm_lookback_days:
                return {
                    'success': False,
                    'error': 'Insufficient data for lookback period'
                }

            X = data[-settings.lstm_lookback_days:].reshape(
                1, settings.lstm_lookback_days, len(feature_cols)
            )

            # Make prediction
            predictions = model.predict(X)

            # Extract predictions
            direction_prob = float(predictions['direction'][0])
            price_change_pct = float(predictions['price_change'][0])
            confidence = float(predictions['confidence'][0])

            # Clip price change to realistic daily ranges (-10% to +10%)
            # Based on historical analysis, daily moves are typically ±1-2%
            # with extreme moves up to ±10%
            price_change_pct = np.clip(price_change_pct, -0.10, 0.10)

            # Determine direction from the classification head
            direction_prediction = 'up' if direction_prob > 0.5 else 'down'

            # Use the price change sign as the final direction (more reliable)
            # This ensures consistency between predicted direction and price change
            predicted_direction = 'up' if price_change_pct > 0 else 'down'

            # If direction head disagrees with price head, reduce confidence
            if direction_prediction != predicted_direction:
                confidence = confidence * 0.7  # Reduce confidence when predictions disagree
                logger.warning(
                    f"{ticker}: Direction mismatch - classification says {direction_prediction}, "
                    f"but price change is {price_change_pct:.4f}. Using price change sign."
                )

            # Get current price
            current_price = float(df['close'].iloc[-1])
            predicted_price = current_price * (1 + price_change_pct)

            # Get prediction date and target date
            last_date = df['date'].iloc[-1]
            prediction_date = datetime.now().date()

            # Calculate next trading day (skip weekends)
            target_date = last_date + timedelta(days=1)
            # If target date falls on weekend, move to Monday
            while target_date.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
                target_date = target_date + timedelta(days=1)

            # Save prediction to database
            prediction_id = self._save_prediction(
                ticker=ticker,
                model_id=model_info['id'],
                prediction_date=prediction_date,
                target_date=target_date,
                predicted_direction=predicted_direction,
                confidence=confidence,
                predicted_price=predicted_price,
                predicted_change_percent=price_change_pct * 100,
                features_used=feature_cols
            )

            logger.info(
                f"Prediction for {ticker}: {predicted_direction} "
                f"({direction_prob:.2%} confidence)"
            )

            return {
                'success': True,
                'ticker': ticker,
                'prediction_id': prediction_id,
                'prediction_date': prediction_date.isoformat(),
                'target_date': target_date.isoformat(),
                'current_price': current_price,
                'predicted_direction': predicted_direction,
                'direction_probability': direction_prob,
                'predicted_price': predicted_price,
                'predicted_change_percent': price_change_pct * 100,
                'confidence': confidence,
                'model_id': model_info['id'],
                'model_version': model_info['version']
            }

        except Exception as e:
            logger.error(f"Prediction failed for {ticker}: {e}", exc_info=True)
            return {
                'success': False,
                'ticker': ticker,
                'error': str(e)
            }

    def predict_batch(self, tickers: List[str]) -> List[Dict]:
        """
        Make predictions for multiple tickers
        """
        results = []
        for ticker in tickers:
            result = self.predict_next_day(ticker)
            results.append(result)
        return results

    def _save_prediction(
        self,
        ticker: str,
        model_id: int,
        prediction_date,
        target_date,
        predicted_direction: str,
        confidence: float,
        predicted_price: float,
        predicted_change_percent: float,
        features_used: List[str]
    ) -> int:
        """
        Save prediction to database
        """
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor()

            # Get company ID
            cursor.execute(
                "SELECT id FROM companies WHERE ticker = %s",
                (ticker,)
            )
            company_result = cursor.fetchone()
            if not company_result:
                raise ValueError(f"Company not found: {ticker}")

            company_id = company_result[0]

            # Insert prediction
            cursor.execute("""
                INSERT INTO predictions (
                    company_id, model_id, prediction_date, target_date,
                    predicted_direction, confidence, predicted_price,
                    predicted_change_percent, features_used
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                company_id,
                model_id,
                prediction_date,
                target_date,
                predicted_direction,
                confidence,
                predicted_price,
                predicted_change_percent,
                json.dumps(features_used)
            ))

            prediction_id = cursor.fetchone()[0]

            conn.commit()
            cursor.close()
            conn.close()

            logger.info(f"Prediction saved with ID: {prediction_id}")
            return prediction_id

        except Exception as e:
            logger.error(f"Error saving prediction: {e}")
            raise


# Global instance
_predictor = None


def get_predictor() -> StockPredictor:
    """Get or create predictor instance"""
    global _predictor
    if _predictor is None:
        _predictor = StockPredictor()
    return _predictor
