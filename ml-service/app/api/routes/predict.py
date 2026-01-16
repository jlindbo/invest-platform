"""
Prediction API Routes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger

from app.inference.predictor import get_predictor


router = APIRouter()


class PredictionRequest(BaseModel):
    ticker: str


class BatchPredictionRequest(BaseModel):
    tickers: List[str]


@router.post("/predict/single")
async def predict_single(request: PredictionRequest):
    """
    Predict next day price movement for a single stock
    """
    try:
        predictor = get_predictor()
        result = predictor.predict_next_day(request.ticker)

        if not result['success']:
            raise HTTPException(status_code=400, detail=result.get('error', 'Prediction failed'))

        return result

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict/batch")
async def predict_batch(request: BatchPredictionRequest):
    """
    Predict next day price movements for multiple stocks
    """
    try:
        predictor = get_predictor()
        results = predictor.predict_batch(request.tickers)

        return {
            "success": True,
            "count": len(results),
            "predictions": results
        }

    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predict/history/{ticker}")
async def get_prediction_history(ticker: str, limit: int = 30):
    """
    Get prediction history for a ticker
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        from app.config.settings import settings

        conn = psycopg2.connect(settings.database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT
                p.id,
                p.prediction_date,
                p.target_date,
                p.predicted_direction,
                p.confidence,
                p.predicted_price,
                p.predicted_change_percent,
                p.actual_direction,
                p.actual_price,
                p.actual_change_percent,
                p.is_correct,
                m.version as model_version
            FROM predictions p
            JOIN companies c ON p.company_id = c.id
            LEFT JOIN ml_models m ON p.model_id = m.id
            WHERE c.ticker = %s
            ORDER BY p.target_date DESC
            LIMIT %s
        """, (ticker, limit))

        predictions = cursor.fetchall()

        cursor.close()
        conn.close()

        return {
            "success": True,
            "ticker": ticker,
            "count": len(predictions),
            "predictions": [dict(p) for p in predictions]
        }

    except Exception as e:
        logger.error(f"Error fetching prediction history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
