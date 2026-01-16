"""
Sentiment Analysis API Routes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from loguru import logger

from app.models.sentiment_analyzer import get_sentiment_analyzer


router = APIRouter()


class SentimentRequest(BaseModel):
    text: str


class BatchSentimentRequest(BaseModel):
    texts: List[str]


@router.post("/sentiment/analyze")
async def analyze_sentiment(request: SentimentRequest):
    """
    Analyze sentiment of Norwegian text
    """
    try:
        analyzer = get_sentiment_analyzer()
        result = analyzer.analyze(request.text)

        return {
            "success": True,
            "sentiment": result
        }

    except Exception as e:
        logger.error(f"Sentiment analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sentiment/batch")
async def analyze_sentiment_batch(request: BatchSentimentRequest):
    """
    Analyze sentiment for multiple texts
    """
    try:
        analyzer = get_sentiment_analyzer()
        results = analyzer.analyze_batch(request.texts)

        return {
            "success": True,
            "count": len(results),
            "sentiments": results
        }

    except Exception as e:
        logger.error(f"Batch sentiment analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sentiment/update-articles")
async def update_article_sentiments(limit: int = 100):
    """
    Process and update sentiment for articles without sentiment scores
    """
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        from app.config.settings import settings

        analyzer = get_sentiment_analyzer()

        # Fetch articles without sentiment
        conn = psycopg2.connect(settings.database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT id, title, content, summary
            FROM news_articles
            WHERE sentiment_score IS NULL
            ORDER BY published_at DESC
            LIMIT %s
        """, (limit,))

        articles = cursor.fetchall()
        cursor.close()

        logger.info(f"Processing {len(articles)} articles")

        updated_count = 0

        for article in articles:
            # Analyze text (combine title and content)
            text = f"{article['title']} {article['content'] or article['summary'] or ''}"
            sentiment = analyzer.analyze(text)

            # Update database
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE news_articles
                SET
                    sentiment_score = %s,
                    sentiment_label = %s,
                    sentiment_confidence = %s
                WHERE id = %s
            """, (
                sentiment['score'],
                sentiment['label'],
                sentiment['confidence'],
                article['id']
            ))
            cursor.close()
            updated_count += 1

        conn.commit()
        conn.close()

        logger.info(f"Updated sentiment for {updated_count} articles")

        return {
            "success": True,
            "updated_count": updated_count
        }

    except Exception as e:
        logger.error(f"Error updating article sentiments: {e}")
        raise HTTPException(status_code=500, detail=str(e))
