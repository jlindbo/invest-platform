"""
Training API Routes
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from loguru import logger

from app.training.lstm_trainer import train_ticker


router = APIRouter()


class TrainingRequest(BaseModel):
    ticker: str
    epochs: Optional[int] = None


@router.post("/train/lstm")
async def train_lstm_model(request: TrainingRequest, background_tasks: BackgroundTasks):
    """
    Train LSTM model for a ticker (runs in background)
    """
    try:
        # Add training task to background
        background_tasks.add_task(
            _train_model_task,
            request.ticker,
            request.epochs
        )

        return {
            "success": True,
            "message": f"Training started for {request.ticker}",
            "ticker": request.ticker,
            "status": "training_in_progress"
        }

    except Exception as e:
        logger.error(f"Training start error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _train_model_task(ticker: str, epochs: Optional[int]):
    """
    Background task for training
    """
    try:
        logger.info(f"Starting background training for {ticker}")
        result = train_ticker(ticker, epochs)

        if result['success']:
            logger.info(f"Training completed for {ticker}")
        else:
            logger.error(f"Training failed for {ticker}: {result.get('error')}")

    except Exception as e:
        logger.error(f"Training task error: {e}", exc_info=True)


@router.get("/train/status/{ticker}")
async def get_training_status(ticker: str):
    """
    Get training status and model info for a ticker
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        from app.config.settings import settings

        conn = psycopg2.connect(settings.database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Get latest model
        cursor.execute("""
            SELECT
                id,
                name,
                version,
                model_type,
                training_date,
                validation_accuracy,
                test_metrics,
                is_active
            FROM ml_models
            WHERE name = %s
            ORDER BY training_date DESC
            LIMIT 1
        """, (f'lstm_{ticker}',))

        model_info = cursor.fetchone()

        cursor.close()
        conn.close()

        if not model_info:
            return {
                "success": True,
                "ticker": ticker,
                "status": "no_model_found",
                "has_model": False
            }

        return {
            "success": True,
            "ticker": ticker,
            "status": "model_available",
            "has_model": True,
            "model": dict(model_info)
        }

    except Exception as e:
        logger.error(f"Error getting training status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
