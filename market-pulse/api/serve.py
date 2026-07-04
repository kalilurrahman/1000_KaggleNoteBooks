#!/usr/bin/env python3
"""
Market Pulse SLM: FastAPI Inference Service
Serves real-time market signals via REST API
Integrates with Ollama for GGUF model inference
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
import json
from pathlib import Path
from typing import Optional, List

app = FastAPI(title="Market Pulse SLM", version="1.0")

# Would load: GGUF model via Ollama, market data feeds, eval metrics

class MarketFeatures(BaseModel):
    asset: str
    price_change_24h: float
    sentiment_score: float  # -1 to 1
    news_summary: str
    technical_rsi: float
    technical_macd: float
    bollinger_position: float

class MarketSignal(BaseModel):
    asset: str
    signal: str  # BUY, HOLD, SELL
    confidence: float  # 0-1
    reasoning: str
    risk_level: str  # LOW, MEDIUM, HIGH
    timestamp: str
    latency_ms: float

class TraderFeedback(BaseModel):
    signal_id: str
    feedback: str  # CORRECT, INCORRECT, PARTIALLY
    outcome: Optional[str]  # actual_signal: BUY|HOLD|SELL

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "model": "market-pulse-slm (Qwen3-1.7B)",
        "quantization": "GGUF 4-bit"
    }

@app.post("/api/market-pulse/signal", response_model=MarketSignal)
async def generate_signal(features: MarketFeatures):
    """Generate a single market signal from latest data"""
    start_time = datetime.now()

    # In production: call Ollama endpoint with features
    # result = ollama_client.generate(prompt=format_prompt(features))
    # Parse output into MarketSignal

    result = MarketSignal(
        asset=features.asset,
        signal="BUY" if features.sentiment_score > 0.2 else "HOLD",
        confidence=0.72,
        reasoning=f"Sentiment {features.sentiment_score:.2f}, RSI {features.technical_rsi:.1f}, Price Change {features.price_change_24h:.1f}%",
        risk_level="MEDIUM",
        timestamp=datetime.now().isoformat(),
        latency_ms=(datetime.now() - start_time).total_seconds() * 1000
    )

    # Log signal for later evaluation
    log_signal(result)

    return result

@app.get("/api/market-pulse/latest")
async def get_latest_signals(limit: int = 20):
    """Fetch latest N market signals"""
    signals_file = Path("data/market_signals.jsonl")

    if not signals_file.exists():
        raise HTTPException(status_code=404, detail="No signals available")

    signals = []
    with open(signals_file) as f:
        for line in reversed(f.readlines()[-limit:]):
            signals.append(json.loads(line))

    return {
        "count": len(signals),
        "signals": signals,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/market-pulse/brief")
async def get_market_brief():
    """Hourly market brief: top signals, sentiment shifts, risk alerts"""
    signals_file = Path("data/market_signals.jsonl")
    metrics_file = Path("training/eval_metrics.json")

    # Load latest signals
    signals = []
    if signals_file.exists():
        with open(signals_file) as f:
            for line in f:
                signals.append(json.loads(line))

    # Load metrics
    metrics = {}
    if metrics_file.exists():
        with open(metrics_file) as f:
            metrics = json.load(f)

    # Filter and rank signals
    buy_signals = sorted(
        [s for s in signals if s.get("signal") == "BUY"],
        key=lambda x: x.get("confidence", 0),
        reverse=True
    )[:5]

    sell_signals = sorted(
        [s for s in signals if s.get("signal") == "SELL"],
        key=lambda x: x.get("confidence", 0),
        reverse=True
    )[:3]

    return {
        "timestamp": datetime.now().isoformat(),
        "performance": {
            "accuracy_24h": metrics.get("signal_accuracy_24h", 0.0),
            "win_rate": metrics.get("win_rate", 0.0),
            "sharpe_ratio": metrics.get("sharpe_ratio", 0.0)
        },
        "top_buys": buy_signals,
        "top_sells": sell_signals,
        "risk_alerts": [
            {"asset": "SPY", "alert": "High volatility", "level": "MEDIUM"},
            {"asset": "BTC-USD", "alert": "Overbought (RSI > 70)", "level": "HIGH"}
        ],
        "sentiment_shifts": [
            {"asset": "QQQ", "previous_sentiment": 0.2, "current_sentiment": 0.6, "change": "+200%"}
        ]
    }

@app.post("/api/market-pulse/feedback")
async def submit_trader_feedback(feedback: TraderFeedback):
    """Collect trader corrections for retraining"""
    feedback_log = Path("data/trader_feedback.jsonl")

    with open(feedback_log, "a") as f:
        f.write(json.dumps({
            "signal_id": feedback.signal_id,
            "feedback": feedback.feedback,
            "outcome": feedback.outcome,
            "timestamp": datetime.now().isoformat()
        }) + "\n")

    return {
        "status": "received",
        "message": "Feedback logged for next training cycle",
        "signal_id": feedback.signal_id
    }

@app.get("/api/market-pulse/metrics")
async def get_model_metrics():
    """Model performance metrics (24h, 7d, 30d)"""
    metrics_file = Path("training/eval_metrics.json")

    if not metrics_file.exists():
        return {"status": "no metrics available"}

    with open(metrics_file) as f:
        latest = json.load(f)

    return {
        "latest": latest,
        "window_24h": {
            "accuracy": latest.get("signal_accuracy_24h", 0.0),
            "signals_generated": latest.get("total_signals", 0),
            "correct": latest.get("correct_signals", 0)
        },
        "model_version": "ckpt-20260704-120000",
        "deployment_status": "primary",
        "next_retraining": "2026-07-05 00:00:00 UTC"
    }

def log_signal(signal: MarketSignal):
    """Append signal to log for evaluation tracking"""
    signals_file = Path("data/market_signals.jsonl")
    signals_file.parent.mkdir(parents=True, exist_ok=True)

    with open(signals_file, "a") as f:
        f.write(json.dumps(signal.dict()) + "\n")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
