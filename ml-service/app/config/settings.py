from pydantic_settings import BaseSettings
from pydantic import Field
import os


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # Database
    database_url: str = Field(
        default="postgresql://invest_user:changeme@localhost:5432/invest_db",
        env="DATABASE_URL"
    )

    # Redis
    redis_url: str = Field(
        default="redis://localhost:6379",
        env="REDIS_URL"
    )

    # Paths
    model_path: str = Field(default="/app/data/models", env="MODEL_PATH")
    data_path: str = Field(default="/app/data", env="DATA_PATH")

    # LSTM Configuration
    lstm_lookback_days: int = Field(default=60, env="LSTM_LOOKBACK_DAYS")
    lstm_batch_size: int = Field(default=32, env="LSTM_BATCH_SIZE")
    lstm_epochs: int = Field(default=50, env="LSTM_EPOCHS")
    lstm_learning_rate: float = Field(default=0.001, env="LSTM_LEARNING_RATE")

    # Sentiment Model
    sentiment_model_name: str = Field(default="ltgoslo/norbert", env="SENTIMENT_MODEL_NAME")
    sentiment_max_length: int = Field(default=512, env="SENTIMENT_MAX_LENGTH")

    # Training
    train_test_split: float = Field(default=0.15, env="TRAIN_TEST_SPLIT")
    validation_split: float = Field(default=0.15, env="VALIDATION_SPLIT")
    early_stopping_patience: int = Field(default=10, env="EARLY_STOPPING_PATIENCE")

    # Feature Engineering
    use_technical_indicators: bool = Field(default=True, env="USE_TECHNICAL_INDICATORS")
    use_sentiment_features: bool = Field(default=True, env="USE_SENTIMENT_FEATURES")
    use_volume_features: bool = Field(default=True, env="USE_VOLUME_FEATURES")

    # Logging
    log_level: str = Field(default="info", env="LOG_LEVEL")
    log_file: str = Field(default="/app/logs/ml-service.log", env="LOG_FILE")

    # API
    api_host: str = Field(default="0.0.0.0", env="API_HOST")
    api_port: int = Field(default=8000, env="API_PORT")

    class Config:
        env_file = ".env"
        case_sensitive = False


# Create global settings instance
settings = Settings()

# Ensure directories exist
os.makedirs(settings.model_path, exist_ok=True)
os.makedirs(settings.data_path, exist_ok=True)
os.makedirs(os.path.join(settings.data_path, "raw"), exist_ok=True)
os.makedirs(os.path.join(settings.data_path, "processed"), exist_ok=True)
