from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
import sys
from datetime import datetime

from app.config.settings import settings

# Import API routes
from app.api.routes import predict, sentiment, train

# Configure logger
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level.upper()
)
logger.add(
    settings.log_file,
    rotation="500 MB",
    retention="10 days",
    level=settings.log_level.upper()
)

# Initialize FastAPI app
app = FastAPI(
    title="J Group Invest Corp - ML Service",
    description="Machine Learning service for Norwegian stock market predictions",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on your needs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 Starting ML Service...")
    logger.info(f"Model path: {settings.model_path}")
    logger.info(f"Data path: {settings.data_path}")
    logger.info(f"LSTM lookback days: {settings.lstm_lookback_days}")
    logger.info("ML Service started successfully")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down ML Service...")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc) if settings.log_level == "debug" else "An unexpected error occurred",
        },
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "J Group Invest Corp - ML Service",
        "version": "1.0.0",
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "ml-service",
    }


@app.get("/api/v1/status")
async def status():
    """Detailed status endpoint"""
    return {
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
        "configuration": {
            "lstm_lookback_days": settings.lstm_lookback_days,
            "sentiment_model": settings.sentiment_model_name,
            "model_path": settings.model_path,
        },
        "features": {
            "technical_indicators": settings.use_technical_indicators,
            "sentiment_analysis": settings.use_sentiment_features,
            "volume_features": settings.use_volume_features,
        },
        "version": "1.0.0",
    }


# API Routes
app.include_router(predict.router, prefix="/api/v1", tags=["predictions"])
app.include_router(train.router, prefix="/api/v1", tags=["training"])
app.include_router(sentiment.router, prefix="/api/v1", tags=["sentiment"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )
