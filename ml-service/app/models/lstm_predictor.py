"""
LSTM Model for Stock Price Prediction
"""
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from typing import Dict, Tuple, Optional
from loguru import logger
import os

from app.config.settings import settings


class LSTMPricePredictor:
    """
    Multi-output LSTM model for stock price prediction

    Outputs:
    1. Direction (up/down) - Binary classification
    2. Price change percentage - Regression
    3. Confidence score
    """

    def __init__(
        self,
        input_shape: Tuple[int, int],
        lstm_units: list = None,
        dropout_rate: float = 0.3,
        learning_rate: float = None
    ):
        if lstm_units is None:
            lstm_units = [128, 64, 32]

        if learning_rate is None:
            learning_rate = settings.lstm_learning_rate

        self.input_shape = input_shape  # (lookback_days, n_features)
        self.lstm_units = lstm_units
        self.dropout_rate = dropout_rate
        self.learning_rate = learning_rate
        self.model = None
        self.history = None

    def build_model(self) -> Model:
        """
        Build the LSTM model architecture
        """
        logger.info(f"Building LSTM model with input shape: {self.input_shape}")

        # Input layer
        inputs = layers.Input(shape=self.input_shape, name='input')

        # First LSTM layer with return sequences
        x = layers.LSTM(
            self.lstm_units[0],
            return_sequences=True,
            name='lstm_1'
        )(inputs)
        x = layers.Dropout(self.dropout_rate, name='dropout_1')(x)

        # Second LSTM layer with return sequences
        x = layers.LSTM(
            self.lstm_units[1],
            return_sequences=True,
            name='lstm_2'
        )(x)
        x = layers.Dropout(self.dropout_rate, name='dropout_2')(x)

        # Third LSTM layer without return sequences
        x = layers.LSTM(
            self.lstm_units[2],
            return_sequences=False,
            name='lstm_3'
        )(x)
        x = layers.Dropout(self.dropout_rate * 0.7, name='dropout_3')(x)

        # Dense layers
        x = layers.Dense(64, activation='relu', name='dense_1')(x)
        x = layers.Dropout(0.2, name='dropout_4')(x)
        x = layers.Dense(32, activation='relu', name='dense_2')(x)

        # Output heads
        # 1. Direction prediction (binary classification)
        direction_output = layers.Dense(
            1,
            activation='sigmoid',
            name='direction'
        )(x)

        # 2. Price change prediction (regression)
        price_output = layers.Dense(
            1,
            activation='linear',
            name='price_change'
        )(x)

        # 3. Confidence score
        confidence_output = layers.Dense(
            1,
            activation='sigmoid',
            name='confidence'
        )(x)

        # Create model
        model = Model(
            inputs=inputs,
            outputs=[direction_output, price_output, confidence_output],
            name='lstm_stock_predictor'
        )

        # Compile model
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss={
                'direction': 'binary_crossentropy',
                'price_change': 'mse',
                'confidence': 'mse'
            },
            loss_weights={
                'direction': 1.0,
                'price_change': 0.5,
                'confidence': 0.3
            },
            metrics={
                'direction': ['accuracy', tf.keras.metrics.AUC()],
                'price_change': ['mae'],
                'confidence': ['mae']
            }
        )

        self.model = model
        logger.info(f"Model built successfully with {model.count_params():,} parameters")

        return model

    def train(
        self,
        X_train: np.ndarray,
        y_direction_train: np.ndarray,
        y_price_train: np.ndarray,
        X_val: np.ndarray,
        y_direction_val: np.ndarray,
        y_price_val: np.ndarray,
        epochs: int = None,
        batch_size: int = None,
        model_path: str = None
    ) -> Dict:
        """
        Train the model
        """
        if epochs is None:
            epochs = settings.lstm_epochs
        if batch_size is None:
            batch_size = settings.lstm_batch_size
        if model_path is None:
            model_path = os.path.join(
                settings.model_path,
                'lstm_model_best.h5'
            )

        logger.info(f"Starting training for {epochs} epochs")

        if self.model is None:
            self.build_model()

        # Create confidence targets (higher confidence for larger price changes)
        y_confidence_train = np.abs(y_price_train)
        y_confidence_val = np.abs(y_price_val)

        # Prepare training data
        y_train = {
            'direction': y_direction_train,
            'price_change': y_price_train,
            'confidence': y_confidence_train
        }

        y_val = {
            'direction': y_direction_val,
            'price_change': y_price_val,
            'confidence': y_confidence_val
        }

        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_direction_accuracy',
                patience=settings.early_stopping_patience,
                restore_best_weights=True,
                verbose=1
            ),
            ModelCheckpoint(
                filepath=model_path,
                monitor='val_direction_accuracy',
                save_best_only=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6,
                verbose=1
            )
        ]

        # Train model
        history = self.model.fit(
            X_train,
            y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )

        self.history = history.history
        logger.info("Training completed")

        # Get final metrics
        final_metrics = {
            'epochs_trained': len(history.history['loss']),
            'final_train_loss': float(history.history['loss'][-1]),
            'final_val_loss': float(history.history['val_loss'][-1]),
            'final_train_accuracy': float(history.history['direction_accuracy'][-1]),
            'final_val_accuracy': float(history.history['val_direction_accuracy'][-1]),
            'best_val_accuracy': float(max(history.history['val_direction_accuracy'])),
        }

        logger.info(f"Final validation accuracy: {final_metrics['final_val_accuracy']:.4f}")
        logger.info(f"Best validation accuracy: {final_metrics['best_val_accuracy']:.4f}")

        return final_metrics

    def predict(
        self,
        X: np.ndarray
    ) -> Dict[str, np.ndarray]:
        """
        Make predictions

        Returns:
            Dict with 'direction', 'price_change', and 'confidence' arrays
        """
        if self.model is None:
            raise ValueError("Model not built or loaded")

        predictions = self.model.predict(X, verbose=0)

        return {
            'direction': predictions[0].flatten(),
            'price_change': predictions[1].flatten(),
            'confidence': predictions[2].flatten()
        }

    def evaluate(
        self,
        X_test: np.ndarray,
        y_direction_test: np.ndarray,
        y_price_test: np.ndarray
    ) -> Dict:
        """
        Evaluate model performance
        """
        if self.model is None:
            raise ValueError("Model not built or loaded")

        logger.info("Evaluating model on test set")

        # Create confidence targets
        y_confidence_test = np.abs(y_price_test)

        y_test = {
            'direction': y_direction_test,
            'price_change': y_price_test,
            'confidence': y_confidence_test
        }

        # Evaluate
        results = self.model.evaluate(X_test, y_test, verbose=0)

        # Extract metrics
        metrics = {}
        for i, metric_name in enumerate(self.model.metrics_names):
            metrics[metric_name] = float(results[i])

        # Make predictions for additional metrics
        predictions = self.predict(X_test)
        y_pred_direction = (predictions['direction'] > 0.5).astype(int)

        # Calculate confusion matrix
        from sklearn.metrics import confusion_matrix, classification_report

        cm = confusion_matrix(y_direction_test, y_pred_direction)
        metrics['confusion_matrix'] = cm.tolist()

        # Calculate accuracy, precision, recall, F1
        tn, fp, fn, tp = cm.ravel()
        metrics['true_positives'] = int(tp)
        metrics['true_negatives'] = int(tn)
        metrics['false_positives'] = int(fp)
        metrics['false_negatives'] = int(fn)

        accuracy = (tp + tn) / (tp + tn + fp + fn)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        metrics['accuracy'] = float(accuracy)
        metrics['precision'] = float(precision)
        metrics['recall'] = float(recall)
        metrics['f1_score'] = float(f1)

        logger.info(f"Test Accuracy: {accuracy:.4f}")
        logger.info(f"Test Precision: {precision:.4f}")
        logger.info(f"Test Recall: {recall:.4f}")
        logger.info(f"Test F1 Score: {f1:.4f}")

        return metrics

    def save(self, filepath: str):
        """Save model to file"""
        if self.model is None:
            raise ValueError("No model to save")

        self.model.save(filepath)
        logger.info(f"Model saved to {filepath}")

    def load(self, filepath: str):
        """Load model from file"""
        self.model = keras.models.load_model(filepath)
        logger.info(f"Model loaded from {filepath}")

    def get_model_summary(self) -> str:
        """Get model architecture summary"""
        if self.model is None:
            return "Model not built"

        from io import StringIO
        import sys

        stream = StringIO()
        self.model.summary(print_fn=lambda x: stream.write(x + '\n'))
        return stream.getvalue()
