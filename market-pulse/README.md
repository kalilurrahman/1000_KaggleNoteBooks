# Market Pulse SLM

Real-time financial market sentiment analyzer and trading signal generator built with Qwen3-1.7B using Unsloth QLoRA + DPO.

## Architecture

```
┌─────────────────────┐
│   Market Data       │  Hourly feeds: News, Stocks, Crypto, Social
│   Ingestion         │  → Aggregate features → signal input
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Inference (SLM)    │  Ollama + FastAPI
│  <500ms latency     │  Qwen3-1.7B (GGUF 4-bit)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Signal Output      │  BUY/HOLD/SELL with confidence
│  + Logging          │  + Risk alerts, reasoning
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Evaluation         │  Compare to actual price moves
│  + Accuracy Track   │  (1h, 4h, 24h ahead)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Retraining (Daily) │  If accuracy <65% OR 24h passed
│  QLoRA + DPO        │  Unsloth: 30min on T4, 2-4 epochs
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Deploy via A/B     │  GGUF quantize, run parallel
│  Test & Swap        │  If >2% accuracy gain, promote
└─────────────────────┘
```

## Quick Start

### 1. Setup Environment
```bash
# Install dependencies
pip install unsloth torch transformers fastapi uvicorn ollama praw yfinance newsapi

# Create data directories
mkdir -p data models/market-pulse-slm training api

# Set API keys
export NEWSAPI_KEY=your_key
export REDDIT_CLIENT_ID=your_id
export REDDIT_CLIENT_SECRET=your_secret
export TWITTER_BEARER_TOKEN=your_token
```

### 2. Generate Initial SLM Config
```bash
# Use SLM Builder to create slm-config.json
# Pre-configured for: Qwen3-1.7B, finetune, unsloth, qloRA+DPO
# Domain: financial-markets
# Task: market-sentiment
cat slm-config.json
```

### 3. Ingest Training Data
```bash
# Seed with Kaggle datasets + live APIs
python -c "
import json
from datetime import datetime

# Example: create initial training data
training_data = [
    {
        'timestamp': datetime.now().isoformat(),
        'asset': 'SPY',
        'price_change': 2.3,
        'sentiment_score': 0.65,
        'news_summary': 'Fed cuts rates, market rallies',
        'technical_rsi': 65,
        'technical_macd': 0.02,
        'bollinger_position': 0.75,
        'expected_signal': 'BUY',
        'confidence': 0.8,
        'outcome_1h': 'correct',
        'outcome_24h': 'correct'
    }
]

with open('data/historical_signals.jsonl', 'w') as f:
    for example in training_data:
        f.write(json.dumps(example) + '\n')
"
```

### 4. Train SLM
```bash
python training/train_pipeline.py

# Output:
# [INFO] Loaded 5000 training examples from last 24h
# [OK] Training completed: accuracy_after=0.72, latency_p95_ms=380
# [OK] Evaluation results: accuracy=72.0%
```

### 5. Start Inference Service
```bash
# Terminal 1: Start Ollama (with GGUF model)
ollama serve

# Terminal 2: Start FastAPI
python api/serve.py
# INFO:     Uvicorn running on http://0.0.0.0:8000

# Terminal 3: Test endpoints
curl http://localhost:8000/health
curl http://localhost:8000/api/market-pulse/latest
curl http://localhost:8000/api/market-pulse/brief
```

## API Endpoints

### `GET /health`
Health check.
```json
{
  "status": "healthy",
  "model": "market-pulse-slm (Qwen3-1.7B)",
  "quantization": "GGUF 4-bit"
}
```

### `POST /api/market-pulse/signal`
Generate a signal from market features.
```json
Request:
{
  "asset": "SPY",
  "price_change_24h": 2.3,
  "sentiment_score": 0.65,
  "news_summary": "Fed cuts rates",
  "technical_rsi": 65,
  "technical_macd": 0.02,
  "bollinger_position": 0.75
}

Response:
{
  "asset": "SPY",
  "signal": "BUY",
  "confidence": 0.78,
  "reasoning": "Sentiment 0.65, RSI 65, Price Change 2.3%",
  "risk_level": "MEDIUM",
  "timestamp": "2026-07-04T12:30:00",
  "latency_ms": 380
}
```

### `GET /api/market-pulse/latest`
Latest N signals.
```json
{
  "count": 20,
  "signals": [...],
  "timestamp": "2026-07-04T12:30:00"
}
```

### `GET /api/market-pulse/brief`
Hourly market brief.
```json
{
  "timestamp": "2026-07-04T12:00:00",
  "performance": {
    "accuracy_24h": 0.72,
    "win_rate": 0.65,
    "sharpe_ratio": 1.2
  },
  "top_buys": [...],
  "top_sells": [...],
  "risk_alerts": [...],
  "sentiment_shifts": [...]
}
```

### `POST /api/market-pulse/feedback`
Submit trader feedback for retraining.
```json
{
  "signal_id": "SPY-2026-07-04-12-30",
  "feedback": "INCORRECT",
  "outcome": "SELL"
}
```

### `GET /api/market-pulse/metrics`
Model performance metrics.
```json
{
  "latest": {...},
  "window_24h": {
    "accuracy": 0.72,
    "signals_generated": 150,
    "correct": 108
  },
  "model_version": "ckpt-20260704-120000",
  "deployment_status": "primary",
  "next_retraining": "2026-07-05 00:00:00 UTC"
}
```

## Loop: Continuous Training & Signal Generation

### Hourly Loop
1. **Ingest** latest market data (news, prices, sentiment)
2. **Generate signals** via SLM inference (<500ms)
3. **Log signals** for evaluation
4. **Generate brief** (top buys, sells, risk alerts)

### Daily Loop (or on accuracy drop <65%)
5. **Evaluate** signals vs actual price moves
6. **Retrain** SLM with new outcomes (2-4 epochs, 30min)
7. **Deploy** new model (A/B test, swap if >2% gain)
8. **Reset** training window

## Configuration

Edit `slm-config.json` to customize:
- Model size (options: 0.6B, 1.7B, 3.8B, 7B)
- Training method (QLoRA, full fine-tune, DPO)
- Data sources (which APIs, refresh frequency)
- Hardware target (T4, A100, Lambda)
- Success criteria (accuracy target, latency SLO)

## Monitoring

Track metrics in `training/eval_metrics.json`:
- Signal accuracy (rolling 24h)
- Win rate (profitable vs unprofitable)
- Sharpe ratio (risk-adjusted returns)
- Latency p95 (inference speed SLO)
- Model drift (accuracy degradation)

Alert triggers:
- Accuracy <60% → force retrain
- Latency >500ms → investigate inference pipeline
- Data staleness >1h → reingest feeds

## Deployment Options

### Development
```bash
# Single T4 GPU (Colab)
python training/train_pipeline.py --colab --gpu t4
python api/serve.py --workers 1
```

### Production
```bash
# Docker + A100 cluster
docker build -t market-pulse .
docker run --gpus all -p 8000:8000 market-pulse

# AWS Lambda (serverless inference)
# Deploy GGUF via API Gateway + Lambda + ECS
```

### Monitoring & Alerts
- Prometheus scrape `/metrics` endpoint
- Grafana dashboard for accuracy, latency, volume
- PagerDuty alert on model drift, inference errors

## Next Steps

1. ✅ Initialize app structure
2. ✅ Create SLM config
3. ✅ Build training pipeline
4. ✅ Implement FastAPI inference service
5. 📋 Deploy to cloud (DigitalOcean, AWS, GCP)
6. 📋 Wire up live market data feeds
7. 📋 Set up continuous retraining job
8. 📋 Build trader dashboard + feedback UI
9. 📋 Integrate with trading platform (paper trading first)
10. 📋 Monitor accuracy, optimize for profitability

## License

MIT
