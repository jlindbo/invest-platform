"""
Enhanced Feature Engineering for Stock Price Prediction
Includes advanced technical indicators and market signals
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from loguru import logger
from sklearn.preprocessing import RobustScaler
import psycopg2
from psycopg2.extras import RealDictCursor

from app.config.settings import settings


class EnhancedFeatureEngineer:
    """
    Enhanced feature engineering with advanced technical indicators
    and market pattern recognition
    """

    def __init__(self):
        # Use RobustScaler instead of MinMaxScaler for better outlier handling
        self.scaler = RobustScaler()
        self.lookback_days = settings.lstm_lookback_days

    def fetch_stock_data(
        self,
        ticker: str,
        days: Optional[int] = None
    ) -> pd.DataFrame:
        """Fetch stock data from database"""
        if days is None:
            days = self.lookback_days + 500  # Extra data for indicators

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
        """Fetch aggregated daily sentiment scores with more metrics"""
        try:
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
                SELECT
                    DATE(na.published_at) as date,
                    AVG(na.sentiment_score) as avg_sentiment,
                    STDDEV(na.sentiment_score) as sentiment_std,
                    MIN(na.sentiment_score) as min_sentiment,
                    MAX(na.sentiment_score) as max_sentiment,
                    COUNT(*) as article_count,
                    SUM(CASE WHEN na.sentiment_score > 0.2 THEN 1 ELSE 0 END) as positive_count,
                    SUM(CASE WHEN na.sentiment_score < -0.2 THEN 1 ELSE 0 END) as negative_count
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
                for col in df.columns:
                    if col != 'date':
                        df[col] = pd.to_numeric(df[col], errors='coerce')

            return df

        except Exception as e:
            logger.error(f"Error fetching sentiment data: {e}")
            return pd.DataFrame()

    def engineer_features(self, df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """
        Create advanced features for the model
        """
        df = df.copy()

        # ===== Price-based features =====
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))

        # Multiple timeframe returns
        df['returns_3d'] = df['close'].pct_change(3)
        df['returns_5d'] = df['close'].pct_change(5)
        df['returns_10d'] = df['close'].pct_change(10)
        df['returns_20d'] = df['close'].pct_change(20)

        # ===== Volume features =====
        df['volume_change'] = df['volume'].pct_change()
        df['volume_ma_5'] = df['volume'].rolling(5).mean()
        df['volume_ma_20'] = df['volume'].rolling(20).mean()
        df['volume_ma_ratio'] = df['volume'] / df['volume_ma_20']

        # Price-volume correlation
        df['price_volume_corr'] = df['close'].rolling(20).corr(df['volume'])

        # ===== Volatility features =====
        df['volatility_5d'] = df['returns'].rolling(5).std()
        df['volatility_10d'] = df['returns'].rolling(10).std()
        df['volatility_20d'] = df['returns'].rolling(20).std()
        df['volatility_ratio'] = df['volatility_5d'] / df['volatility_20d']

        # ===== Momentum indicators =====
        # Rate of Change (ROC)
        df['roc_5'] = ((df['close'] - df['close'].shift(5)) / df['close'].shift(5)) * 100
        df['roc_10'] = ((df['close'] - df['close'].shift(10)) / df['close'].shift(10)) * 100

        # Money Flow Index approximation
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        money_flow = typical_price * df['volume']
        df['money_flow_ratio'] = money_flow / money_flow.rolling(14).mean()

        # ===== Trend indicators =====
        # ADX (Average Directional Index) approximation
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        df['atr_proxy'] = true_range.rolling(14).mean()

        # ===== Bollinger Bands features =====
        if 'bollinger_upper' in df.columns and df['bollinger_upper'].notna().any():
            bb_range = df['bollinger_upper'] - df['bollinger_lower']
            bb_range = bb_range.replace(0, 1)
            df['bb_position'] = (df['close'] - df['bollinger_lower']) / bb_range
            df['bb_width'] = bb_range / df['bollinger_middle']

            # BB squeeze indicator
            df['bb_squeeze'] = (bb_range < bb_range.rolling(20).mean()).astype(int)
        else:
            df['bb_position'] = 0.5
            df['bb_width'] = 1.0
            df['bb_squeeze'] = 0

        # ===== Moving average features =====
        if 'sma_20' in df.columns and df['sma_20'].notna().any():
            df['price_sma20_ratio'] = df['close'] / df['sma_20']
            df['sma20_sma50_ratio'] = df['sma_20'] / df['sma_50'] if 'sma_50' in df.columns else 1.0

            # Golden cross / Death cross signals
            df['ma_cross_signal'] = 0
            if 'sma_50' in df.columns:
                df.loc[(df['sma_20'] > df['sma_50']) & (df['sma_20'].shift() <= df['sma_50'].shift()), 'ma_cross_signal'] = 1
                df.loc[(df['sma_20'] < df['sma_50']) & (df['sma_20'].shift() >= df['sma_50'].shift()), 'ma_cross_signal'] = -1
        else:
            df['price_sma20_ratio'] = 1.0
            df['sma20_sma50_ratio'] = 1.0
            df['ma_cross_signal'] = 0

        if 'sma_50' in df.columns and df['sma_50'].notna().any():
            df['price_sma50_ratio'] = df['close'] / df['sma_50']
        else:
            df['price_sma50_ratio'] = 1.0

        if 'sma_200' in df.columns and df['sma_200'].notna().any():
            df['price_sma200_ratio'] = df['close'] / df['sma_200']
        else:
            df['price_sma200_ratio'] = 1.0

        # ===== RSI features =====
        if 'rsi_14' in df.columns and df['rsi_14'].notna().any():
            df['rsi_normalized'] = (df['rsi_14'] - 50) / 50  # Normalize to [-1, 1]
            df['rsi_overbought'] = (df['rsi_14'] > 70).astype(int)
            df['rsi_oversold'] = (df['rsi_14'] < 30).astype(int)

            # RSI divergence approximation
            price_trend = df['close'].diff(5)
            rsi_trend = df['rsi_14'].diff(5)
            df['rsi_divergence'] = np.sign(price_trend) != np.sign(rsi_trend)
        else:
            df['rsi_normalized'] = 0
            df['rsi_overbought'] = 0
            df['rsi_oversold'] = 0
            df['rsi_divergence'] = False

        # ===== MACD features =====
        if 'macd' in df.columns and df['macd'].notna().any():
            df['macd_signal_diff'] = df['macd'] - df['macd_signal']

            # MACD crossover signals
            df['macd_cross'] = 0
            df.loc[(df['macd'] > df['macd_signal']) & (df['macd'].shift() <= df['macd_signal'].shift()), 'macd_cross'] = 1
            df.loc[(df['macd'] < df['macd_signal']) & (df['macd'].shift() >= df['macd_signal'].shift()), 'macd_cross'] = -1

            # MACD histogram
            df['macd_histogram'] = df['macd'] - df['macd_signal']
        else:
            df['macd_signal_diff'] = 0
            df['macd_cross'] = 0
            df['macd_histogram'] = 0

        # ===== Stochastic features =====
        if 'stochastic_k' in df.columns and df['stochastic_k'].notna().any():
            df['stoch_overbought'] = (df['stochastic_k'] > 80).astype(int)
            df['stoch_oversold'] = (df['stochastic_k'] < 20).astype(int)
            if 'stochastic_d' in df.columns:
                df['stoch_k_d_diff'] = df['stochastic_k'] - df['stochastic_d']
        else:
            df['stoch_overbought'] = 0
            df['stoch_oversold'] = 0
            df['stoch_k_d_diff'] = 0

        # ===== Price patterns =====
        # Higher highs, lower lows
        df['higher_high'] = (df['high'] > df['high'].shift()).astype(int)
        df['lower_low'] = (df['low'] < df['low'].shift()).astype(int)

        # Gap detection
        df['gap_up'] = (df['open'] > df['close'].shift()).astype(int)
        df['gap_down'] = (df['open'] < df['close'].shift()).astype(int)

        # Candle body size
        df['body_size'] = np.abs(df['close'] - df['open']) / df['open']

        # Candle shadows
        df['upper_shadow'] = (df['high'] - df[['open', 'close']].max(axis=1)) / df['high']
        df['lower_shadow'] = (df[['open', 'close']].min(axis=1) - df['low']) / df['low']

        # ===== Market regime indicators =====
        # Trending vs ranging market
        df['trend_strength'] = np.abs(df['returns_20d']) / df['volatility_20d']

        # ===== Merge sentiment data =====
        if settings.use_sentiment_features:
            try:
                start_date = df['date'].min().strftime('%Y-%m-%d')
                end_date = df['date'].max().strftime('%Y-%m-%d')
                sentiment_df = self.fetch_sentiment_data(ticker, start_date, end_date)

                if not sentiment_df.empty:
                    df = df.merge(sentiment_df, on='date', how='left')

                    # Fill missing sentiment
                    df['avg_sentiment'] = df['avg_sentiment'].fillna(0)
                    df['sentiment_std'] = df['sentiment_std'].fillna(0)
                    df['min_sentiment'] = df['min_sentiment'].fillna(0)
                    df['max_sentiment'] = df['max_sentiment'].fillna(0)
                    df['article_count'] = df['article_count'].fillna(0)
                    df['positive_count'] = df['positive_count'].fillna(0)
                    df['negative_count'] = df['negative_count'].fillna(0)

                    # Sentiment features
                    df['sentiment_momentum'] = df['avg_sentiment'].diff(3)
                    df['sentiment_volatility'] = df['avg_sentiment'].rolling(5).std()
                    df['news_intensity'] = df['article_count'].rolling(3).mean()
                else:
                    self._add_empty_sentiment_features(df)
            except Exception as e:
                logger.warning(f"Could not fetch sentiment data: {e}")
                self._add_empty_sentiment_features(df)
        else:
            self._add_empty_sentiment_features(df)

        # ===== Lag features =====
        # Previous day's key indicators
        df['prev_returns'] = df['returns'].shift(1)
        df['prev_volume_ratio'] = df['volume_ma_ratio'].shift(1)
        df['prev_rsi'] = df['rsi_14'].shift(1) if 'rsi_14' in df.columns else 0

        # Fill NaN values
        df = df.fillna(method='ffill').fillna(method='bfill').fillna(0)

        # Replace inf values
        df = df.replace([np.inf, -np.inf], 0)

        logger.info(f"Engineered {len(df.columns)} features")

        return df

    def _add_empty_sentiment_features(self, df: pd.DataFrame):
        """Add empty sentiment features"""
        df['avg_sentiment'] = 0
        df['sentiment_std'] = 0
        df['min_sentiment'] = 0
        df['max_sentiment'] = 0
        df['article_count'] = 0
        df['positive_count'] = 0
        df['negative_count'] = 0
        df['sentiment_momentum'] = 0
        df['sentiment_volatility'] = 0
        df['news_intensity'] = 0

    def get_feature_columns(self) -> List[str]:
        """
        Get list of all feature columns to use for training
        """
        feature_cols = [
            # Price features
            'close', 'returns', 'log_returns',
            'returns_3d', 'returns_5d', 'returns_10d', 'returns_20d',

            # Volume features
            'volume', 'volume_ma_ratio', 'price_volume_corr',

            # Volatility
            'volatility_5d', 'volatility_10d', 'volatility_20d', 'volatility_ratio',

            # Momentum
            'roc_5', 'roc_10', 'money_flow_ratio',

            # Bollinger Bands
            'bb_position', 'bb_width', 'bb_squeeze',

            # Moving averages
            'price_sma20_ratio', 'price_sma50_ratio', 'price_sma200_ratio',
            'sma20_sma50_ratio', 'ma_cross_signal',

            # RSI
            'rsi_14', 'rsi_normalized', 'rsi_overbought', 'rsi_oversold',

            # MACD
            'macd', 'macd_signal_diff', 'macd_cross', 'macd_histogram',

            # Stochastic
            'stochastic_k', 'stoch_overbought', 'stoch_oversold', 'stoch_k_d_diff',

            # Price patterns
            'body_size', 'upper_shadow', 'lower_shadow',
            'gap_up', 'gap_down',

            # Market regime
            'trend_strength',

            # Lag features
            'prev_returns', 'prev_volume_ratio', 'prev_rsi',
        ]

        if settings.use_sentiment_features:
            feature_cols.extend([
                'avg_sentiment', 'sentiment_std', 'sentiment_momentum',
                'article_count', 'news_intensity',
                'positive_count', 'negative_count'
            ])

        return feature_cols

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
            y_price: Target price change percentage
        """
        # Ensure all feature columns exist
        feature_cols = [col for col in feature_cols if col in df.columns]

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
        logger.info(f"Direction distribution: {np.bincount(y_direction)}")

        return X, y_direction, y_price

    def prepare_training_data(
        self,
        ticker: str,
        train_split: float = 0.7,
        val_split: float = 0.15
    ) -> Dict:
        """
        Prepare complete training dataset with enhanced features

        Returns:
            Dict with train/val/test splits
        """
        logger.info(f"Preparing enhanced training data for {ticker}")

        # Fetch data
        df = self.fetch_stock_data(ticker)

        if len(df) < self.lookback_days + 100:
            raise ValueError(
                f"Insufficient data: {len(df)} rows, "
                f"need at least {self.lookback_days + 100}"
            )

        # Engineer enhanced features
        df = self.engineer_features(df, ticker)

        # Get feature columns
        feature_cols = self.get_feature_columns()

        # Ensure all columns exist
        feature_cols = [col for col in feature_cols if col in df.columns]

        logger.info(f"Using {len(feature_cols)} features: {feature_cols[:10]}...")

        # Create sequences
        X, y_direction, y_price = self.create_sequences(df, feature_cols)

        # Split data (time series split - no shuffling)
        n = len(X)
        train_size = int(n * train_split)
        val_size = int(n * val_split)

        X_train = X[:train_size]
        y_direction_train = y_direction[:train_size]
        y_price_train = y_price[:train_size]

        X_val = X[train_size:train_size + val_size]
        y_direction_val = y_direction[train_size:train_size + val_size]
        y_price_val = y_price[train_size:train_size + val_size]

        X_test = X[train_size + val_size:]
        y_direction_test = y_direction[train_size + val_size:]
        y_price_test = y_price[train_size + val_size:]

        logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

        return {
            'X_train': X_train,
            'y_direction_train': y_direction_train,
            'y_price_train': y_price_train,
            'X_val': X_val,
            'y_direction_val': y_direction_val,
            'y_price_val': y_price_val,
            'X_test': X_test,
            'y_direction_test': y_direction_test,
            'y_price_test': y_price_test,
            'feature_cols': feature_cols,
            'n_features': len(feature_cols)
        }
