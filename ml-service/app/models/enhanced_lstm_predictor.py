"""
Enhanced LSTM Model with Attention Mechanism for Stock Price Prediction
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


class AttentionLayer(layers.Layer):
    """
    Attention mechanism for LSTM
    Helps model focus on important time steps
    """
    def __init__(self, **kwargs):
        super(AttentionLayer, self).__init__(**kwargs)

    def build(self, input_shape):
        self.W = self.add_weight(
            name='attention_weight',
            shape=(input_shape[-1], input_shape[-1]),
            initializer='glorot_uniform',
            trainable=True
        )
        self.b = self.add_weight(
            name='attention_bias',
            shape=(input_shape[-1],),
            initializer='zeros',
            trainable=True
        )
        self.u = self.add_weight(
            name='attention_u',
            shape=(input_shape[-1],),
            initializer='glorot_uniform',
            trainable=True
        )
        super(AttentionLayer, self).build(input_shape)

    def call(self, x):
        # x shape: (batch_size, time_steps, features)

        # Calculate attention scores
        uit = tf.tanh(tf.tensordot(x, self.W, axes=1) + self.b)
        ait = tf.tensordot(uit, self.u, axes=1)

        # Apply softmax
        attention_weights = tf.nn.softmax(ait, axis=1)
        attention_weights = tf.expand_dims(attention_weights, -1)

        # Apply attention weights
        weighted_input = x * attention_weights
        output = tf.reduce_sum(weighted_input, axis=1)

        return output

    def compute_output_shape(self, input_shape):
        return (input_shape[0], input_shape[-1])


class EnhancedLSTMPredictor:
    """
    Enhanced Multi-output LSTM model with Attention for stock price prediction

    Improvements over basic LSTM:
    1. Attention mechanism to focus on important time steps
    2. Batch normalization for training stability
    3. Bidirectional LSTM for capturing both past and future context
    4. Better confidence calculation using prediction uncertainty
    5. Residual connections for deeper networks

    Outputs:
    1. Direction (up/down) - Binary classification
    2. Price change percentage - Regression
    3. Confidence score - Based on prediction certainty
    """

    def __init__(
        self,
        input_shape: Tuple[int, int],
        lstm_units: list = None,
        dropout_rate: float = 0.3,
        learning_rate: float = None,
        use_bidirectional: bool = True,
        use_attention: bool = True
    ):
        if lstm_units is None:
            lstm_units = [128, 64, 32]

        if learning_rate is None:
            learning_rate = settings.lstm_learning_rate

        self.input_shape = input_shape  # (lookback_days, n_features)
        self.lstm_units = lstm_units
        self.dropout_rate = dropout_rate
        self.learning_rate = learning_rate
        self.use_bidirectional = use_bidirectional
        self.use_attention = use_attention
        self.model = None
        self.history = None

    def build_model(self) -> Model:
        """
        Build the enhanced LSTM model architecture
        """
        logger.info(f"Building Enhanced LSTM model with input shape: {self.input_shape}")

        # Input layer
        inputs = layers.Input(shape=self.input_shape, name='input')

        # First LSTM layer (Bidirectional for better context)
        if self.use_bidirectional:
            x = layers.Bidirectional(
                layers.LSTM(
                    self.lstm_units[0],
                    return_sequences=True,
                    name='lstm_1'
                )
            )(inputs)
        else:
            x = layers.LSTM(
                self.lstm_units[0],
                return_sequences=True,
                name='lstm_1'
            )(inputs)

        x = layers.BatchNormalization()(x)
        x = layers.Dropout(self.dropout_rate, name='dropout_1')(x)

        # Second LSTM layer
        if self.use_bidirectional:
            x = layers.Bidirectional(
                layers.LSTM(
                    self.lstm_units[1],
                    return_sequences=True,
                    name='lstm_2'
                )
            )(x)
        else:
            x = layers.LSTM(
                self.lstm_units[1],
                return_sequences=True,
                name='lstm_2'
            )(x)

        x = layers.BatchNormalization()(x)
        x = layers.Dropout(self.dropout_rate, name='dropout_2')(x)

        # Attention mechanism or regular LSTM
        if self.use_attention:
            # Use attention to focus on important time steps
            attention_output = AttentionLayer(name='attention')(x)
            x = attention_output
        else:
            # Regular LSTM without attention
            x = layers.LSTM(
                self.lstm_units[2],
                return_sequences=False,
                name='lstm_3'
            )(x)

        x = layers.BatchNormalization()(x)
        x = layers.Dropout(self.dropout_rate * 0.7, name='dropout_3')(x)

        # Dense layers with residual connection
        dense1 = layers.Dense(128, activation='relu', name='dense_1')(x)
        dense1 = layers.BatchNormalization()(dense1)
        dense1 = layers.Dropout(0.2, name='dropout_4')(dense1)

        dense2 = layers.Dense(64, activation='relu', name='dense_2')(dense1)
        dense2 = layers.BatchNormalization()(dense2)

        # Residual connection
        if dense1.shape[-1] == dense2.shape[-1]:
            x = layers.Add()([dense1, dense2])
        else:
            x = dense2

        x = layers.Dense(32, activation='relu', name='dense_3')(x)

        # Output heads
        # 1. Direction prediction (binary classification)
        direction_features = layers.Dense(16, activation='relu', name='direction_features')(x)
        direction_output = layers.Dense(
            1,
            activation='sigmoid',
            name='direction'
        )(direction_features)

        # 2. Price change prediction (regression)
        price_features = layers.Dense(16, activation='relu', name='price_features')(x)
        price_output = layers.Dense(
            1,
            activation='linear',
            name='price_change'
        )(price_features)

        # 3. Confidence score (based on prediction certainty)
        # Higher confidence for clearer signals
        confidence_features = layers.Dense(16, activation='relu', name='confidence_features')(x)
        confidence_output = layers.Dense(
            1,
            activation='sigmoid',
            name='confidence'
        )(confidence_features)

        # Create model
        model = Model(
            inputs=inputs,
            outputs=[direction_output, price_output, confidence_output],
            name='enhanced_lstm_stock_predictor'
        )

        # Custom loss weights (emphasize direction accuracy)
        loss_weights = {
            'direction': 1.5,  # Increased weight for direction
            'price_change': 0.8,  # Moderate weight for price
            'confidence': 0.5  # Lower weight for confidence
        }

        # Compile model with better optimizer settings
        model.compile(
            optimizer=keras.optimizers.Adam(
                learning_rate=self.learning_rate,
                beta_1=0.9,
                beta_2=0.999,
                epsilon=1e-7
            ),
            loss={
                'direction': 'binary_crossentropy',
                'price_change': 'huber',  # Huber loss is more robust to outliers
                'confidence': 'mse'
            },
            loss_weights=loss_weights,
            metrics={
                'direction': [
                    'accuracy',
                    tf.keras.metrics.AUC(name='auc'),
                    tf.keras.metrics.Precision(name='precision'),
                    tf.keras.metrics.Recall(name='recall')
                ],
                'price_change': ['mae', 'mse'],
                'confidence': ['mae']
            }
        )

        self.model = model
        logger.info(f"Enhanced model built successfully with {model.count_params():,} parameters")

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
        model_path: str = None,
        class_weight: dict = None
    ) -> Dict:
        """
        Train the model with improved training strategy
        """
        if epochs is None:
            epochs = settings.lstm_epochs
        if batch_size is None:
            batch_size = settings.lstm_batch_size
        if model_path is None:
            model_path = os.path.join(
                settings.model_path,
                'enhanced_lstm_model_best.h5'
            )

        logger.info(f"Starting training for {epochs} epochs with batch size {batch_size}")

        if self.model is None:
            self.build_model()

        # Calculate class weights if not provided
        if class_weight is None:
            unique, counts = np.unique(y_direction_train, return_counts=True)
            total = len(y_direction_train)
            class_weight = {
                int(unique[0]): total / (2 * counts[0]),
                int(unique[1]): total / (2 * counts[1])
            }
            logger.info(f"Calculated class weights: {class_weight}")

        # Create confidence targets based on price change magnitude
        # Higher confidence for larger, clearer price movements
        y_confidence_train = 1 / (1 + np.exp(-5 * np.abs(y_price_train)))
        y_confidence_val = 1 / (1 + np.exp(-5 * np.abs(y_price_val)))

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

        # Enhanced callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_direction_accuracy',
                patience=settings.early_stopping_patience + 5,  # More patience
                restore_best_weights=True,
                mode='max',
                verbose=1
            ),
            ModelCheckpoint(
                filepath=model_path,
                monitor='val_direction_auc',  # Use AUC instead of accuracy
                save_best_only=True,
                mode='max',
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=7,
                min_lr=1e-7,
                verbose=1,
                mode='min'
            ),
            keras.callbacks.TensorBoard(
                log_dir=os.path.join(settings.model_path, 'logs'),
                histogram_freq=1
            )
        ]

        # Train model with class weights
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
            'final_train_auc': float(history.history['direction_auc'][-1]),
            'final_val_auc': float(history.history['val_direction_auc'][-1]),
            'best_val_auc': float(max(history.history['val_direction_auc'])),
        }

        logger.info(f"Final validation accuracy: {final_metrics['final_val_accuracy']:.4f}")
        logger.info(f"Best validation accuracy: {final_metrics['best_val_accuracy']:.4f}")
        logger.info(f"Final validation AUC: {final_metrics['final_val_auc']:.4f}")
        logger.info(f"Best validation AUC: {final_metrics['best_val_auc']:.4f}")

        return final_metrics

    def predict(
        self,
        X: np.ndarray
    ) -> Dict[str, np.ndarray]:
        """
        Make predictions with uncertainty estimation

        Returns:
            Dict with 'direction', 'price_change', and 'confidence' arrays
        """
        if self.model is None:
            raise ValueError("Model not built or loaded")

        predictions = self.model.predict(X, verbose=0)

        # Adjust confidence based on direction certainty
        # If direction probability is close to 0.5, reduce confidence
        direction_probs = predictions[0].flatten()
        direction_certainty = np.abs(direction_probs - 0.5) * 2  # 0 to 1 scale

        # Combine model confidence with direction certainty
        raw_confidence = predictions[2].flatten()
        adjusted_confidence = raw_confidence * direction_certainty * 0.8 + 0.2  # Min 20% confidence

        return {
            'direction': direction_probs,
            'price_change': predictions[1].flatten(),
            'confidence': adjusted_confidence
        }

    def evaluate(
        self,
        X_test: np.ndarray,
        y_direction_test: np.ndarray,
        y_price_test: np.ndarray
    ) -> Dict:
        """
        Evaluate model performance with comprehensive metrics
        """
        if self.model is None:
            raise ValueError("Model not built or loaded")

        logger.info("Evaluating enhanced model on test set")

        # Create confidence targets
        y_confidence_test = 1 / (1 + np.exp(-5 * np.abs(y_price_test)))

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

        # Average confidence
        metrics['avg_confidence'] = float(np.mean(predictions['confidence']))

        logger.info(f"Test Accuracy: {accuracy:.4f}")
        logger.info(f"Test Precision: {precision:.4f}")
        logger.info(f"Test Recall: {recall:.4f}")
        logger.info(f"Test F1 Score: {f1:.4f}")
        logger.info(f"Average Confidence: {metrics['avg_confidence']:.4f}")

        return metrics

    def save(self, filepath: str):
        """Save model to file"""
        if self.model is None:
            raise ValueError("No model to save")

        self.model.save(filepath)
        logger.info(f"Model saved to {filepath}")

    def load(self, filepath: str):
        """Load model from file"""
        self.model = keras.models.load_model(
            filepath,
            custom_objects={'AttentionLayer': AttentionLayer}
        )
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
