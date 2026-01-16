"""
Training Pipeline for LSTM Stock Predictor
"""
import os
import json
from datetime import datetime
from typing import Dict, Optional
from loguru import logger
import psycopg2

from app.config.settings import settings
from app.preprocessing.feature_engineering import FeatureEngineer
from app.models.lstm_predictor import LSTMPricePredictor


class LSTMTrainer:
    """
    Complete training pipeline for LSTM model
    """

    def __init__(self, ticker: str):
        self.ticker = ticker
        self.feature_engineer = FeatureEngineer()
        self.model = None
        self.training_info = {}

    def train_model(
        self,
        epochs: Optional[int] = None,
        batch_size: Optional[int] = None,
        save_model: bool = True
    ) -> Dict:
        """
        Train LSTM model for a specific ticker

        Returns:
            Dict with training results and model info
        """
        logger.info(f"Starting LSTM training pipeline for {self.ticker}")

        try:
            # Step 1: Prepare data
            logger.info("Step 1: Preparing training data")
            data = self.feature_engineer.prepare_training_data(
                ticker=self.ticker,
                train_split=1.0 - settings.train_test_split - settings.validation_split,
                val_split=settings.validation_split
            )

            # Extract data
            X_train = data['X_train']
            y_direction_train = data['y_direction_train']
            y_price_train = data['y_price_train']
            X_val = data['X_val']
            y_direction_val = data['y_direction_val']
            y_price_val = data['y_price_val']
            X_test = data['X_test']
            y_direction_test = data['y_direction_test']
            y_price_test = data['y_price_test']

            input_shape = (X_train.shape[1], X_train.shape[2])
            logger.info(f"Input shape: {input_shape}")

            # Step 2: Build model
            logger.info("Step 2: Building LSTM model")
            self.model = LSTMPricePredictor(input_shape=input_shape)
            self.model.build_model()

            # Step 3: Train model
            logger.info("Step 3: Training model")
            training_metrics = self.model.train(
                X_train=X_train,
                y_direction_train=y_direction_train,
                y_price_train=y_price_train,
                X_val=X_val,
                y_direction_val=y_direction_val,
                y_price_val=y_price_val,
                epochs=epochs,
                batch_size=batch_size
            )

            # Step 4: Evaluate on test set
            logger.info("Step 4: Evaluating model")
            test_metrics = self.model.evaluate(
                X_test=X_test,
                y_direction_test=y_direction_test,
                y_price_test=y_price_test
            )

            # Step 5: Save model
            model_filename = f"lstm_{self.ticker.replace('.', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.h5"
            model_path = os.path.join(settings.model_path, model_filename)

            if save_model:
                logger.info(f"Step 5: Saving model to {model_path}")
                self.model.save(model_path)

            # Step 6: Save model metadata to database
            model_info = self._save_model_metadata(
                model_path=model_path,
                training_metrics=training_metrics,
                test_metrics=test_metrics,
                data_info=data['scaler_info']
            )

            logger.info("Training pipeline completed successfully")

            return {
                'success': True,
                'ticker': self.ticker,
                'model_id': model_info['model_id'],
                'model_path': model_path,
                'training_metrics': training_metrics,
                'test_metrics': test_metrics,
                'data_info': {
                    'train_samples': len(X_train),
                    'val_samples': len(X_val),
                    'test_samples': len(X_test),
                    'features': data['feature_cols'],
                    'lookback_days': self.feature_engineer.lookback_days
                }
            }

        except Exception as e:
            logger.error(f"Training pipeline failed: {e}", exc_info=True)
            return {
                'success': False,
                'ticker': self.ticker,
                'error': str(e)
            }

    def _save_model_metadata(
        self,
        model_path: str,
        training_metrics: Dict,
        test_metrics: Dict,
        data_info: Dict
    ) -> Dict:
        """
        Save model metadata to database
        """
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor()

            # Get training data date range
            cursor.execute("""
                SELECT MIN(date), MAX(date)
                FROM stock_prices sp
                JOIN companies c ON sp.company_id = c.id
                WHERE c.ticker = %s
            """, (self.ticker,))
            date_range = cursor.fetchone()

            # Prepare hyperparameters
            hyperparameters = {
                'lstm_units': [128, 64, 32],
                'dropout_rate': 0.3,
                'learning_rate': settings.lstm_learning_rate,
                'batch_size': settings.lstm_batch_size,
                'epochs': settings.lstm_epochs,
                'lookback_days': settings.lstm_lookback_days
            }

            # Prepare architecture
            architecture = {
                'type': 'lstm',
                'layers': ['LSTM(128)', 'LSTM(64)', 'LSTM(32)', 'Dense(64)', 'Dense(32)'],
                'outputs': ['direction', 'price_change', 'confidence']
            }

            # Insert model record
            cursor.execute("""
                INSERT INTO ml_models (
                    name, version, model_type, architecture, hyperparameters,
                    training_date, training_data_start, training_data_end,
                    validation_accuracy, validation_loss, test_metrics,
                    file_path, is_active
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                f'lstm_{self.ticker}',
                datetime.now().strftime('%Y%m%d_%H%M%S'),
                'lstm',
                json.dumps(architecture),
                json.dumps(hyperparameters),
                datetime.now(),
                date_range[0] if date_range else None,
                date_range[1] if date_range else None,
                training_metrics.get('best_val_accuracy'),
                training_metrics.get('final_val_loss'),
                json.dumps(test_metrics),
                model_path,
                True  # Set as active
            ))

            model_id = cursor.fetchone()[0]

            # Deactivate other models for this ticker
            cursor.execute("""
                UPDATE ml_models
                SET is_active = false
                WHERE name = %s AND id != %s
            """, (f'lstm_{self.ticker}', model_id))

            conn.commit()
            cursor.close()
            conn.close()

            logger.info(f"Model metadata saved with ID: {model_id}")

            return {
                'model_id': model_id,
                'is_active': True
            }

        except Exception as e:
            logger.error(f"Error saving model metadata: {e}")
            raise


def train_ticker(ticker: str, epochs: Optional[int] = None) -> Dict:
    """
    Convenience function to train a model for a ticker
    """
    trainer = LSTMTrainer(ticker)
    return trainer.train_model(epochs=epochs)


if __name__ == '__main__':
    # Example usage
    import sys

    if len(sys.argv) > 1:
        ticker = sys.argv[1]
    else:
        ticker = 'VAR.OL'

    logger.info(f"Training model for {ticker}")
    result = train_ticker(ticker)

    if result['success']:
        logger.info("Training successful!")
        logger.info(f"Model ID: {result['model_id']}")
        logger.info(f"Test Accuracy: {result['test_metrics']['accuracy']:.4f}")
    else:
        logger.error(f"Training failed: {result['error']}")
