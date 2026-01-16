"""
Enhanced Training Script for Stock Prediction Models
Trains models with improved architecture and features
"""
import os
import json
from datetime import datetime
from loguru import logger
import psycopg2
from psycopg2.extras import RealDictCursor

from app.config.settings import settings
from app.models.enhanced_lstm_predictor import EnhancedLSTMPredictor
from app.preprocessing.enhanced_feature_engineering import EnhancedFeatureEngineer


class EnhancedModelTrainer:
    """
    Train enhanced LSTM models for stock prediction
    """

    def __init__(self):
        self.feature_engineer = EnhancedFeatureEngineer()

    def get_company_info(self, ticker: str) -> dict:
        """Get company information from database"""
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                "SELECT id, ticker, name FROM companies WHERE ticker = %s",
                (ticker,)
            )
            company = cursor.fetchone()

            cursor.close()
            conn.close()

            if company:
                return dict(company)
            return None

        except Exception as e:
            logger.error(f"Error fetching company info: {e}")
            return None

    def save_model_to_db(
        self,
        ticker: str,
        company_id: int,
        model_path: str,
        metrics: dict,
        hyperparameters: dict
    ) -> int:
        """Save model metadata to database"""
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor()

            # Deactivate old models
            cursor.execute("""
                UPDATE ml_models
                SET is_active = false
                WHERE name = %s
            """, (f'enhanced_lstm_{ticker}',))

            # Insert new model
            cursor.execute("""
                INSERT INTO ml_models (
                    name, version, model_type, file_path, training_date,
                    validation_accuracy, test_metrics, is_active,
                    hyperparameters
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                f'enhanced_lstm_{ticker}',
                datetime.now().strftime('%Y%m%d_%H%M%S'),
                'enhanced_lstm',
                model_path,
                datetime.now(),
                metrics.get('best_val_accuracy', 0),
                json.dumps(metrics),
                True,
                json.dumps(hyperparameters)
            ))

            model_id = cursor.fetchone()[0]

            conn.commit()
            cursor.close()
            conn.close()

            logger.info(f"Saved model to database with ID: {model_id}")
            return model_id

        except Exception as e:
            logger.error(f"Error saving model to database: {e}")
            raise

    def train_model(
        self,
        ticker: str,
        epochs: int = None,
        batch_size: int = None,
        use_bidirectional: bool = True,
        use_attention: bool = True
    ) -> dict:
        """
        Train enhanced model for a ticker

        Args:
            ticker: Stock ticker symbol
            epochs: Number of training epochs
            batch_size: Batch size for training
            use_bidirectional: Use bidirectional LSTM
            use_attention: Use attention mechanism

        Returns:
            Dict with training results and metrics
        """
        logger.info(f"Starting enhanced training for {ticker}")
        logger.info(f"Bidirectional: {use_bidirectional}, Attention: {use_attention}")

        # Get company info
        company = self.get_company_info(ticker)
        if not company:
            raise ValueError(f"Company not found: {ticker}")

        # Prepare training data
        try:
            data = self.feature_engineer.prepare_training_data(
                ticker=ticker,
                train_split=0.7,
                val_split=0.15
            )
        except Exception as e:
            logger.error(f"Error preparing training data: {e}")
            raise

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

        feature_cols = data['feature_cols']
        n_features = data['n_features']

        logger.info(f"Training data shape: {X_train.shape}")
        logger.info(f"Using {n_features} features")

        # Create model
        input_shape = (settings.lstm_lookback_days, n_features)

        model = EnhancedLSTMPredictor(
            input_shape=input_shape,
            lstm_units=[128, 64, 32],
            dropout_rate=0.3,
            learning_rate=0.001,
            use_bidirectional=use_bidirectional,
            use_attention=use_attention
        )

        # Build model
        model.build_model()

        logger.info("Model architecture:")
        logger.info(model.get_model_summary())

        # Model path
        model_dir = os.path.join(settings.model_path, ticker)
        os.makedirs(model_dir, exist_ok=True)

        model_filename = f"enhanced_lstm_{ticker}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.h5"
        model_path = os.path.join(model_dir, model_filename)

        # Train model
        try:
            training_metrics = model.train(
                X_train=X_train,
                y_direction_train=y_direction_train,
                y_price_train=y_price_train,
                X_val=X_val,
                y_direction_val=y_direction_val,
                y_price_val=y_price_val,
                epochs=epochs,
                batch_size=batch_size,
                model_path=model_path
            )
        except Exception as e:
            logger.error(f"Error during training: {e}")
            raise

        # Evaluate on test set
        try:
            test_metrics = model.evaluate(
                X_test=X_test,
                y_direction_test=y_direction_test,
                y_price_test=y_price_test
            )
        except Exception as e:
            logger.error(f"Error during evaluation: {e}")
            test_metrics = {}

        # Combine metrics
        all_metrics = {
            **training_metrics,
            **test_metrics
        }

        # Hyperparameters
        hyperparameters = {
            'lookback_days': settings.lstm_lookback_days,
            'lstm_units': [128, 64, 32],
            'dropout_rate': 0.3,
            'learning_rate': 0.001,
            'use_bidirectional': use_bidirectional,
            'use_attention': use_attention,
            'feature_cols': feature_cols,
            'n_features': n_features,
            'epochs': epochs or settings.lstm_epochs,
            'batch_size': batch_size or settings.lstm_batch_size
        }

        # Save model to database
        try:
            model_id = self.save_model_to_db(
                ticker=ticker,
                company_id=company['id'],
                model_path=model_path,
                metrics=all_metrics,
                hyperparameters=hyperparameters
            )
        except Exception as e:
            logger.error(f"Error saving model to database: {e}")
            model_id = None

        logger.info(f"Training completed for {ticker}")
        logger.info(f"Final validation accuracy: {all_metrics.get('final_val_accuracy', 0):.4f}")
        logger.info(f"Test accuracy: {all_metrics.get('accuracy', 0):.4f}")
        logger.info(f"Average confidence: {all_metrics.get('avg_confidence', 0):.4f}")

        return {
            'success': True,
            'ticker': ticker,
            'model_id': model_id,
            'model_path': model_path,
            'metrics': all_metrics,
            'hyperparameters': hyperparameters
        }

    def train_all_target_stocks(
        self,
        epochs: int = None,
        batch_size: int = None
    ) -> list:
        """
        Train enhanced models for all target stocks

        Returns:
            List of training results for each stock
        """
        logger.info("Training enhanced models for all target stocks")

        # Get target stocks
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute("""
                SELECT ticker, name
                FROM companies
                WHERE is_target = true
                ORDER BY name
            """)

            stocks = cursor.fetchall()

            cursor.close()
            conn.close()

        except Exception as e:
            logger.error(f"Error fetching target stocks: {e}")
            return []

        if not stocks:
            logger.warning("No target stocks found")
            return []

        logger.info(f"Found {len(stocks)} target stocks to train")

        results = []

        for stock in stocks:
            ticker = stock['ticker']
            name = stock['name']

            logger.info(f"\n{'='*60}")
            logger.info(f"Training model for {name} ({ticker})")
            logger.info(f"{'='*60}\n")

            try:
                result = self.train_model(
                    ticker=ticker,
                    epochs=epochs,
                    batch_size=batch_size,
                    use_bidirectional=True,
                    use_attention=True
                )
                results.append(result)

                logger.info(f"✓ Successfully trained model for {ticker}")

            except Exception as e:
                logger.error(f"✗ Failed to train model for {ticker}: {e}")
                results.append({
                    'success': False,
                    'ticker': ticker,
                    'error': str(e)
                })

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("Training Summary")
        logger.info(f"{'='*60}")

        successful = sum(1 for r in results if r.get('success'))
        failed = len(results) - successful

        logger.info(f"Total stocks: {len(results)}")
        logger.info(f"Successful: {successful}")
        logger.info(f"Failed: {failed}")

        for result in results:
            if result.get('success'):
                ticker = result['ticker']
                accuracy = result['metrics'].get('accuracy', 0)
                val_accuracy = result['metrics'].get('best_val_accuracy', 0)
                confidence = result['metrics'].get('avg_confidence', 0)
                logger.info(
                    f"  {ticker}: Val Acc={val_accuracy:.3f}, "
                    f"Test Acc={accuracy:.3f}, "
                    f"Avg Confidence={confidence:.3f}"
                )

        return results


# CLI interface
if __name__ == "__main__":
    import sys

    trainer = EnhancedModelTrainer()

    if len(sys.argv) > 1:
        ticker = sys.argv[1].upper()
        epochs = int(sys.argv[2]) if len(sys.argv) > 2 else None
        batch_size = int(sys.argv[3]) if len(sys.argv) > 3 else None

        logger.info(f"Training enhanced model for {ticker}")
        result = trainer.train_model(ticker, epochs=epochs, batch_size=batch_size)

        if result['success']:
            logger.info(f"✓ Training successful!")
            logger.info(f"Model ID: {result['model_id']}")
            logger.info(f"Test Accuracy: {result['metrics'].get('accuracy', 0):.4f}")
        else:
            logger.error(f"✗ Training failed")
            sys.exit(1)
    else:
        logger.info("Training enhanced models for all target stocks")
        results = trainer.train_all_target_stocks()

        successful = sum(1 for r in results if r.get('success'))
        if successful == len(results):
            logger.info("✓ All models trained successfully!")
        else:
            logger.warning(f"⚠ {len(results) - successful} models failed to train")
            sys.exit(1)
