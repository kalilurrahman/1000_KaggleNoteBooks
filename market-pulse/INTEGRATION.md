# Market Pulse ↔ SLM Builder Integration Guide

Complete guide to building, configuring, and deploying Market Pulse SLM using the unified SLM Builder interface.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SLM Builder Web UI                            │
│              (market-pulse-builder.html)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Model Configuration (base model, training params)      │  │
│  │ • Data Source Selection (NewsAPI, yfinance, CoinGecko)   │  │
│  │ • Deployment Target Choice (local, Docker, Lambda)       │  │
│  │ • Live Metrics Dashboard (accuracy, win rate, latency)   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│           Builder Integration API (port 8001)                    │
│              (api/builder_integration.py)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Config Import/Export                                   │  │
│  │ • Config Validation                                      │  │
│  │ • Deployment Orchestration                               │  │
│  │ • Metrics Aggregation                                    │  │
│  │ • Template Management                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│           Market Pulse Orchestrator (port 8000)                  │
│              (orchestrate.py + FastAPI serve.py)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Hourly Data Ingestion Loop                             │  │
│  │ • Signal Generation & Logging                            │  │
│  │ • Daily Model Retraining                                 │  │
│  │ • A/B Testing & Deployment                               │  │
│  │ • Metrics Tracking & Evaluation                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the Services

```bash
# Terminal 1: Start Market Pulse inference service
cd market-pulse
python api/serve.py
# Output: INFO:     Uvicorn running on http://0.0.0.0:8000

# Terminal 2: Start Builder Integration API
python api/builder_integration.py
# Output: INFO:     Uvicorn running on http://0.0.0.0:8001

# Terminal 3: Open the SLM Builder UI in browser
open ui/market-pulse-builder.html
# or: http://localhost:8001/static/market-pulse-builder.html
```

### 2. Configure the Model

In the **Market Pulse SLM Builder** web interface:

1. **Model Configuration** (left panel)
   - Model Name: `market-pulse-slm`
   - Base Model: `Qwen3-1.7B` (recommended)
   - Training Method: `QLoRA + DPO` (fast, low VRAM)
   - Epochs: `4`
   - Batch Size: `4`
   - Learning Rate: `2e-4`
   - Data Sources: Check `NewsAPI`, `Yahoo Finance`, `CoinGecko`

2. **Deployment & Monitoring** (right panel)
   - Deployment Target: `Local (Dev)` or `Docker (Prod)`
   - Refresh Interval: `Hourly`
   - Retraining Trigger: `65` (retrain if accuracy < 65%)

3. **Export Configuration**
   - Click "Export Config" to download `market-pulse-config.json`

### 3. Deploy the Model

Click **"Deploy Model"** in the UI. This will:

1. Validate the configuration
2. Seed training data (5000+ synthetic examples)
3. Run the training pipeline
4. Evaluate the model
5. Start the inference service
6. Begin hourly market data ingestion

Or deploy via CLI:

```bash
python orchestrate.py hourly 0
```

### 4. Monitor Live Signals

The **Live Market Signals** table at the bottom shows:
- Real-time trading signals (BUY/HOLD/SELL)
- Confidence scores
- Technical reasoning
- Risk levels
- Timestamps

Metrics update every 30 seconds.

## API Reference

### Builder Integration API (Port 8001)

#### GET `/api/builder/current-config`
Get the current Market Pulse SLM configuration.

**Response:**
```json
{
  "modelName": "market-pulse-slm",
  "baseModel": "qwen3-1.7b",
  "trainingMethod": "qlora",
  "epochs": 4,
  "batchSize": 4,
  "dataSources": {
    "newsapi": true,
    "yfinance": true,
    "coingecko": true,
    "reddit": false
  }
}
```

#### POST `/api/builder/validate-config`
Validate a builder configuration before deployment.

**Request:**
```json
{
  "modelName": "market-pulse-slm",
  "baseModel": "qwen3-1.7b",
  "trainingMethod": "qlora",
  "epochs": 4,
  "batchSize": 4,
  "learningRate": "2e-4",
  "dataSources": {"newsapi": true, "yfinance": true, "coingecko": true, "reddit": false},
  "deployTarget": "local",
  "refreshInterval": "hourly",
  "retrainThreshold": 65
}
```

**Response:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

#### POST `/api/builder/deploy`
Deploy a model with the given configuration.

**Request:**
```json
{
  "config": { /* BuilderConfig */ },
  "apiKeys": {
    "NEWSAPI_KEY": "...",
    "REDDIT_CLIENT_ID": "...",
    "TWITTER_BEARER_TOKEN": "..."
  }
}
```

**Response:**
```json
{
  "status": "deployment_started",
  "deploymentId": "deploy-20260704-160000",
  "endpoint": "http://localhost:8000/api/market-pulse/signal"
}
```

#### GET `/api/builder/metrics`
Get live system metrics (accuracy, win rate, latency, signal rate).

**Response:**
```json
{
  "status": "ok",
  "metrics": {
    "timestamp": "2026-07-04T16:00:00",
    "accuracy_24h": 0.72,
    "win_rate": 0.68,
    "latency_p95_ms": 280,
    "signals_24h": 150,
    "signals_1h": 12,
    "sharpe_ratio": 1.2,
    "model_version": "ckpt-20260704-120000"
  }
}
```

#### GET `/api/builder/deployments`
List all model deployments.

**Response:**
```json
{
  "count": 2,
  "deployments": [
    {
      "id": "deploy-20260704-160000",
      "name": "market-pulse-slm",
      "baseModel": "qwen3-1.7b",
      "deployedAt": "2026-07-04T16:00:00",
      "status": "running",
      "endpoint": "http://localhost:8000/api/market-pulse/signal",
      "metrics": { /* live metrics */ }
    }
  ]
}
```

#### GET `/api/builder/templates`
Get pre-configured SLM Builder templates.

**Response:**
```json
{
  "templates": [
    {
      "id": "market-pulse-default",
      "name": "Market Pulse (Default)",
      "description": "Real-time financial sentiment analyzer with QLoRA fine-tuning",
      "baseModel": "qwen3-1.7b",
      "trainingMethod": "qlora",
      "epochs": 4,
      "batchSize": 4,
      "learningRate": "2e-4",
      "dataSources": {...}
    }
  ]
}
```

#### POST `/api/builder/retrain`
Manually trigger model retraining.

**Response:**
```json
{
  "status": "retrain_started",
  "message": "Model retraining initiated",
  "timestamp": "2026-07-04T16:00:00"
}
```

### Market Pulse Inference API (Port 8000)

#### POST `/api/market-pulse/signal`
Generate a single market signal from features.

**Request:**
```json
{
  "asset": "SPY",
  "price_change_24h": 2.3,
  "sentiment_score": 0.65,
  "news_summary": "Fed cuts rates",
  "technical_rsi": 65,
  "technical_macd": 0.02,
  "bollinger_position": 0.75
}
```

**Response:**
```json
{
  "asset": "SPY",
  "signal": "BUY",
  "confidence": 0.78,
  "reasoning": "Sentiment 0.65, RSI 65, Price Change 2.3%",
  "risk_level": "MEDIUM",
  "timestamp": "2026-07-04T16:00:00",
  "latency_ms": 280
}
```

#### GET `/api/market-pulse/latest`
Get latest N market signals.

#### GET `/api/market-pulse/brief`
Get hourly market brief with top signals, sentiment shifts, risk alerts.

#### GET `/api/market-pulse/metrics`
Get model performance metrics.

## Configuration Customization

### Model Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| Base Model | Qwen3-1.7B | 0.5B, 1.7B, 3.8B | Larger = better accuracy, slower |
| Training Method | QLoRA | QLoRA, Full FT | QLoRA is faster, less VRAM |
| Epochs | 4 | 1-20 | More epochs = longer training |
| Batch Size | 4 | 1-32 | Larger = faster, more VRAM |
| Learning Rate | 2e-4 | 1e-5 to 1e-3 | Higher = faster learning, risk of instability |
| LoRA Rank | 16 | 8-64 | Higher = more capacity, more VRAM |

### Data Sources

| Source | Frequency | Updates | Coverage |
|--------|-----------|---------|----------|
| NewsAPI | Hourly | 100 articles/query | Global financial news |
| Yahoo Finance | Hourly | OHLCV data | 50+ stocks, indices |
| CoinGecko | Hourly | Price, volume, market cap | 100+ cryptocurrencies |
| Reddit (optional) | Every 2h | Sentiment from r/stocks, r/cryptocurrency | Community sentiment |

### Deployment Targets

- **Local (Dev)**: Single process, good for testing
- **Docker (Prod)**: Containerized, reproducible
- **AWS Lambda**: Serverless, pay-per-use
- **DigitalOcean**: Cloud VPS, affordable
- **Kubernetes**: Multi-node cluster, scale to production

## Monitoring & Troubleshooting

### Health Check

```bash
curl http://localhost:8000/health
```

### View Live Metrics

```bash
curl http://localhost:8001/api/builder/metrics
```

### Check Deployment Status

```bash
curl http://localhost:8001/api/builder/deployments
```

### View Training Logs

```bash
tail -f training/training_log.jsonl
```

### Manual Retrain

```bash
python orchestrate.py retrain
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "No training data available" | Run `python data/seed_training_data.py` first |
| "API connection failed" | Check API keys are set; builder provides mock data fallback |
| "Model accuracy <65%" | Automatically triggers retraining (or manually trigger via UI) |
| "High latency >500ms" | Consider smaller base model or reduce batch size |

## Integration Examples

### Example 1: Quick Deploy with Defaults

```html
<button onclick="deployWithTemplate('market-pulse-default')">
  Deploy Market Pulse (Recommended)
</button>

<script>
async function deployWithTemplate(templateId) {
  const templates = await fetch('/api/builder/templates').then(r => r.json());
  const template = templates.templates.find(t => t.id === templateId);
  
  const response = await fetch('/api/builder/deploy', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ config: template })
  });
  
  const result = await response.json();
  console.log('Deployment started:', result.deploymentId);
}
</script>
```

### Example 2: Custom Configuration & Export

```python
from api.builder_integration import BuilderConfig

# Create custom config
config = BuilderConfig(
    modelName="market-pulse-v2",
    baseModel="qwen3-3.8b",
    trainingMethod="fullft",
    epochs=6,
    batchSize=8,
    learningRate="1e-4",
    dataSources={
        "newsapi": True,
        "yfinance": True,
        "coingecko": True,
        "reddit": True
    },
    deployTarget="docker",
    refreshInterval="5min",
    retrainThreshold=60
)

# Export and deploy
response = requests.post('http://localhost:8001/api/builder/export-config', json=config.dict())
exported = response.json()
print(exported['savedPath'])
```

### Example 3: Automated Retraining on Accuracy Drop

```python
import asyncio
import aiohttp

async def monitor_accuracy(interval=3600):
    """Monitor accuracy and retrain if needed"""
    async with aiohttp.ClientSession() as session:
        while True:
            # Get live metrics
            async with session.get('http://localhost:8001/api/builder/metrics') as resp:
                metrics = await resp.json()
                accuracy = metrics['metrics']['accuracy_24h']
                
                if accuracy < 0.65:
                    print(f"Accuracy {accuracy:.1%} below threshold, triggering retrain...")
                    async with session.post('http://localhost:8001/api/builder/retrain') as resp:
                        result = await resp.json()
                        print(f"Retrain started: {result['status']}")
            
            await asyncio.sleep(interval)

# Run monitoring
asyncio.run(monitor_accuracy())
```

## Next Steps

1. **Connect Real APIs**: Set environment variables for NEWSAPI_KEY, etc.
2. **Fine-tune Parameters**: Experiment with different base models, batch sizes, learning rates
3. **Add More Data Sources**: Integrate Twitter, Discord, on-chain analytics
4. **Optimize for Trading**: Tune accuracy/latency trade-offs for your use case
5. **Deploy to Production**: Use Docker or cloud deployment options

## References

- [Market Pulse README](README.md)
- [SLM Builder Studio](../slm-builder/)
- [SLM Builder Research](../slm-builder/RESEARCH.md)
- [Training Pipeline](training/train_pipeline.py)
- [Orchestration Guide](orchestrate.py)
