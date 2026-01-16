"""
Feature Engineering for Stock Price Prediction
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from loguru import logger
from sklearn.preprocessing import MinMaxScaler
import psycopg2
from psycopg2.extras import RealDictCursor

from app.config.settings import settings


class FeatureEngineer:
    """
    Feature engineering for LSTM stock prediction model
    """

    def __init__(self):
        self.price_scaler = MinMaxScaler(feature_range=(0, 1))
        self.volume_scaler = MinMaxScaler(feature_range=(0, 1))
        self.indicator_scaler = MinMaxScaler(feature_range=(0, 1))
        self.lookback_days = settings.lstm_lookback_days

    def fetch_stock_data(
        self,
        ticker: str,
        days: Optional[int] = None
    ) -> pd.DataFrame:
        """Fetch stock data from database"""
        if days is None:
            days = self.lookback_days + 300  # Extra data for indicators

        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
                SELECT
                    sp.date,
                    sp.open,
                    sp.high,
                    sp.low,
                    sp.close,
                    sp.volume,
                    sp.adjusted_close,
                    ti.rsi_14,
                    ti.macd,
                    ti.macd_signal,
                    ti.sma_20,
                    ti.sma_50,
                    ti.sma_200,
                    ti.ema_12,
                    ti.ema_26,
                    ti.bollinger_upper,
                    ti.bollinger_middle,
                    ti.bollinger_lower,
                    ti.stochastic_k,
                    ti.stochastic_d,
                    ti.atr_14
                FROM stock_prices sp
                JOIN companies c ON sp.company_id = c.id
                LEFT JOIN technical_indicators ti
                    ON sp.company_id = ti.company_id AND sp.date = ti.date
                WHERE c.ticker = %s
                ORDER BY sp.date DESC
                LIMIT %s
            """

            cursor.execute(query, (ticker, days))
            rows = cursor.fetchall()

            cursor.close()
            conn.close()

            if not rows:
                raise ValueError(f"No data found for ticker {ticker}")

            # Convert to DataFrame
            df = pd.DataFrame(rows)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)

            # Convert decimal types to float
            numeric_cols = [
                'open', 'high', 'low', 'close', 'volume', 'adjusted_close',
                'rsi_14', 'macd', 'macd_signal', 'sma_20', 'sma_50', 'sma_200',
                'ema_12', 'ema_26', 'bollinger_upper', 'bollinger_middle',
                'bollinger_lower', 'stochastic_k', 'stochastic_d', 'atr_14'
            ]
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

            logger.info(f"Fetched {len(df)} rows for {ticker}")
            return df

        except Exception as e:
            logger.error(f"Error fetching stock data: {e}")
            raise

    def fetch_sentiment_data(
        self,
        ticker: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Fetch aggregated daily sentiment scores"""
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
                SELECT
                    DATE(na.published_at) as date,
                    AVG(na.sentiment_score) as avg_sentiment,
                    COUNT(*) as article_count
                FROM news_articles na
                JOIN news_companies nc ON na.id = nc.news_id
                JOIN companies c ON nc.company_id = c.id
                WHERE c.ticker = %s
                    AND na.published_at >= %s
                    AND na.published_at <= %s
                    AND na.sentiment_score IS NOT NULL
                GROUP BY DATE(na.published_at)
                ORDER BY date
            """

            cursor.execute(query, (ticker, start_date, end_date))
            rows = cursor.fetchall()

            cursor.close()
            conn.close()

            df = pd.DataFrame(rows)
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
                df['avg_sentiment'] = pd.to_numeric(df['avg_sentiment'], errors='coerce')
                df['article_count'] = pd.to_numeric(df['article_count'], errors='coerce')

            return df

        except Exception as e:
            logger.error(f"Error fetching sentiment data: {e}")
            return pd.DataFrame()

    def engineer_features(self, df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """
        Create additional features for the model
        """
        df = df.copy()

        # Price-based features
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))

        # Volume features
        df['volume_change'] = df['volume'].pct_change()
        df['volume_ma_ratio'] = df['volume'] / df['volume'].rolling(20).mean()

        # Price position in Bollinger Bands
        if 'bollinger_upper' in df.columns and df['bollinger_upper'].notna().any():
            bb_range = df['bollinger_upper'] - df['bollinger_lower']
            bb_range = bb_range.replace(0, 1)  # Avoid division by zero
            df['bb_position'] = (df['close'] - df['bollinger_lower']) / bb_range
        else:
            df['bb_position'] = 0.5

        # Price relative to moving averages
        if 'sma_20' in df.columns and df['sma_20'].notna().any():
            df['price_sma20_ratio'] = df['close'] / df['sma_20']
        else:
            df['price_sma20_ratio'] = 1.0

        if 'sma_50' in df.columns and df['sma_50'].notna().any():
            df['price_sma50_ratio'] = df['close'] / df['sma_50']
        else:
            df['price_sma50_ratio'] = 1.0

        # Volatility (20-day rolling std of returns)
        df['volatility'] = df['returns'].rolling(20).std()

        # Merge sentiment data
        if settings.use_sentiment_features:
            try:
                start_date = df['date'].min().strftime('%Y-%m-%d')
                end_date = df['date'].max().strftime('%Y-%m-%d')
                sentiment_df = self.fetch_sentiment_data(ticker, start_date, end_date)

                if not sentiment_df.empty:
                    df = df.merge(sentiment_df, on='date', how='left')
                    df['avg_sentiment'] = df['avg_sentiment'].fillna(0)
                    df['article_count'] = df['article_count'].fillna(0)
                else:
                    df['avg_sentiment'] = 0
                    df['article_count'] = 0
            except Exception as e:
                logger.warning(f"Could not fetch sentiment data: {e}")
                df['avg_sentiment'] = 0
                df['article_count'] = 0
        else:
            df['avg_sentiment'] = 0
            df['article_count'] = 0

        # Fill NaN values
        df = df.fillna(method='ffill').fillna(method='bfill').fillna(0)

        return df

    def create_sequences(
        self,
        df: pd.DataFrame,
        feature_cols: List[str],
        target_col: str = 'close'
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Create sequences for LSTM training

        Returns:
            X: Input sequences (samples, lookback_days, features)
            y_direction: Target direction (1=up, 0=down)
            y_price: Target price values
        """
        # Select features
        data = df[feature_cols].values

        # Create sequences
        X = []
        y_direction = []
        y_price = []

        for i in range(self.lookback_days, len(data)):
            # Input sequence
            X.append(data[i - self.lookback_days:i])

            # Target: next day's direction and price
            today_price = df[target_col].iloc[i - 1]
            tomorrow_price = df[target_col].iloc[i]

            # Direction: 1 if up, 0 if down
            direction = 1 if tomorrow_price > today_price else 0
            y_direction.append(direction)

            # Price change percentage
            price_change = (tomorrow_price - today_price) / today_price
            y_price.append(price_change)

        X = np.array(X)
        y_direction = np.array(y_direction)
        y_price = np.array(y_price)

        logger.info(f"Created {len(X)} sequences with shape {X.shape}")

        return X, y_direction, y_price

    def prepare_training_data(
        self,
        ticker: str,
        train_split: float = 0.7,
        val_split: float = 0.15
    ) -> Dict:
        """
        Prepare complete training dataset

        Returns:
            Dict with train/val/test splits
        """
        logger.info(f"Preparing training data for {ticker}")

        # Fetch data
        df = self.fetch_stock_data(ticker)

        if len(df) < self.lookback_days + 100:
            raise ValueError(
                f"Insufficient data: {len(df)} rows, "
                f"need at least {self.lookback_days + 100}"
            )

        # Engineer features
        df = self.engineer_features(df, ticker)

        # Define feature columns
        feature_cols = [
            'close', 'volume', 'returns',
            'rsi_14', 'macd', 'macd_signal',
            'sma_20', 'sma_50',
            'ema_12', 'ema_26',
            'bb_position', 'price_sma20_ratio', 'price_sma50_ratio',
            'stochastic_k', 'volatility'
        ]

        if settings.use_sentiment_features:
            feature_cols.extend(['avg_sentiment', 'article_count'])

        # Ensure all columns exist
        feature_cols = [col for col in feature_cols if col in df.columns]

        logger.info(f"Using {len(feature_cols)} features")

        # Create sequences
        X, y_direction, y_price = self.create_sequences(df, feature_cols)

        # Split data
        n = len(X)
        train_end = int(n * train_split)
        val_end = int(n * (train_split + val_split))

        X_train, y_dir_train, y_price_train = X[:train_end], y_direction[:train_end], y_price[:train_end]
        X_val, y_dir_val, y_price_val = X[train_end:val_end], y_direction[train_end:val_end], y_price[train_end:val_end]
        X_test, y_dir_test, y_price_test = X[val_end:], y_direction[val_end:], y_price[val_end:]

        logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

        return {
            'X_train': X_train,
            'y_direction_train': y_dir_train,
            'y_price_train': y_price_train,
            'X_val': X_val,
            'y_direction_val': y_dir_val,
            'y_price_val': y_price_val,
            'X_test': X_test,
            'y_direction_test': y_dir_test,
            'y_price_test': y_price_test,
            'feature_cols': feature_cols,
            'scaler_info': {
                'feature_cols': feature_cols,
                'lookback_days': self.lookback_days
            }
        }
