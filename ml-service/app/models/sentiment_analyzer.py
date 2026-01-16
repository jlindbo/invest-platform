"""
Norwegian Sentiment Analysis using NorBERT or mBERT
"""
from typing import Dict, List, Optional
import torch
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    pipeline
)
from loguru import logger
import numpy as np

from app.config.settings import settings


class NorwegianSentimentAnalyzer:
    """
    Sentiment analyzer for Norwegian financial text
    Uses NorBERT (Norwegian BERT) or falls back to mBERT
    """

    def __init__(self):
        self.model_name = settings.sentiment_model_name
        self.max_length = settings.sentiment_max_length
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.tokenizer = None
        self.pipeline = None
        self._initialized = False

    def initialize(self):
        """Initialize the sentiment model"""
        if self._initialized:
            return

        logger.info(f"Loading sentiment model: {self.model_name}")

        try:
            # Try to load NorBERT or specified model
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)

            # For sentiment analysis, we need a classification model
            # If the model doesn't have a classification head, we'll use zero-shot
            try:
                self.model = AutoModelForSequenceClassification.from_pretrained(
                    self.model_name,
                    num_labels=3  # negative, neutral, positive
                )
            except Exception:
                logger.warning(
                    f"Model {self.model_name} doesn't have classification head, "
                    "using zero-shot classification"
                )
                # Fall back to using the model for zero-shot classification
                self.pipeline = pipeline(
                    "zero-shot-classification",
                    model=self.model_name,
                    device=0 if self.device == "cuda" else -1
                )

            if self.model:
                self.model.to(self.device)
                self.model.eval()

            self._initialized = True
            logger.info(
                f"Sentiment model loaded successfully on {self.device}"
            )

        except Exception as e:
            logger.error(f"Error loading sentiment model: {e}")
            logger.info("Falling back to simple lexicon-based sentiment")
            self._initialized = False

    def _lexicon_based_sentiment(self, text: str) -> Dict[str, float]:
        """
        Simple lexicon-based sentiment as fallback
        Norwegian positive/negative words
        """
        text_lower = text.lower()

        # Norwegian positive words
        positive_words = [
            'bra', 'god', 'godt', 'flott', 'fantastisk', 'positiv', 'vekst',
            'økning', 'styrking', 'fremgang', 'suksess', 'gevinst', 'profitt',
            'oppgang', 'optimistisk', 'sterk', 'solid', 'robust', 'høy', 'økt'
        ]

        # Norwegian negative words
        negative_words = [
            'dårlig', 'negativ', 'nedgang', 'fall', 'tap', 'krise', 'problem',
            'svak', 'lav', 'pessimistisk', 'risiko', 'trussel', 'bekymring',
            'utfordring', 'usikkerhet', 'reduksjon', 'synkende', 'fallende'
        ]

        # Count occurrences
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)

        # Calculate score
        total = pos_count + neg_count
        if total == 0:
            score = 0.0
            label = "neutral"
        else:
            score = (pos_count - neg_count) / (total + 1)  # Normalize
            if score > 0.2:
                label = "positive"
            elif score < -0.2:
                label = "negative"
            else:
                label = "neutral"

        return {
            "score": float(score),
            "label": label,
            "confidence": min(abs(score) + 0.3, 1.0)
        }

    def analyze(self, text: str) -> Dict[str, float]:
        """
        Analyze sentiment of Norwegian text

        Returns:
            Dict with 'score' (-1 to 1), 'label', and 'confidence'
        """
        if not text or len(text.strip()) == 0:
            return {
                "score": 0.0,
                "label": "neutral",
                "confidence": 0.0
            }

        # Initialize if needed
        if not self._initialized:
            self.initialize()

        # Use lexicon-based if model failed to load
        if not self._initialized:
            return self._lexicon_based_sentiment(text)

        try:
            # Truncate text to max length
            text = text[:self.max_length * 4]  # Rough character limit

            if self.pipeline:
                # Zero-shot classification
                candidate_labels = ["negative", "neutral", "positive"]
                result = self.pipeline(
                    text,
                    candidate_labels=candidate_labels,
                    multi_label=False
                )

                # Map result to score
                label_scores = {
                    label: score
                    for label, score in zip(result["labels"], result["scores"])
                }

                # Calculate sentiment score (-1 to 1)
                score = (
                    label_scores.get("positive", 0.0) -
                    label_scores.get("negative", 0.0)
                )
                label = result["labels"][0]
                confidence = result["scores"][0]

            else:
                # Use fine-tuned classification model
                inputs = self.tokenizer(
                    text,
                    return_tensors="pt",
                    truncation=True,
                    max_length=self.max_length,
                    padding=True
                )
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

                with torch.no_grad():
                    outputs = self.model(**inputs)
                    logits = outputs.logits
                    probabilities = torch.softmax(logits, dim=-1)

                # Get prediction
                predicted_class = torch.argmax(probabilities, dim=-1).item()
                confidence = probabilities[0][predicted_class].item()

                # Map class to label and score
                label_map = {0: "negative", 1: "neutral", 2: "positive"}
                label = label_map[predicted_class]

                # Convert to score (-1 to 1)
                if predicted_class == 0:
                    score = -probabilities[0][0].item()
                elif predicted_class == 2:
                    score = probabilities[0][2].item()
                else:
                    score = 0.0

            return {
                "score": float(score),
                "label": label,
                "confidence": float(confidence)
            }

        except Exception as e:
            logger.error(f"Error analyzing sentiment: {e}")
            # Fall back to lexicon-based
            return self._lexicon_based_sentiment(text)

    def analyze_batch(self, texts: List[str]) -> List[Dict[str, float]]:
        """Analyze sentiment for multiple texts"""
        results = []
        for text in texts:
            result = self.analyze(text)
            results.append(result)
        return results


# Global instance
_sentiment_analyzer = None


def get_sentiment_analyzer() -> NorwegianSentimentAnalyzer:
    """Get or create sentiment analyzer instance"""
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        _sentiment_analyzer = NorwegianSentimentAnalyzer()
        _sentiment_analyzer.initialize()
    return _sentiment_analyzer
