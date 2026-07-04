#!/usr/bin/env python3
"""
Market Pulse SLM Builder Integration API
Bridges SLM Builder web UI with Market Pulse deployment & orchestration
Handles config import/export, model deployment, and live metrics aggregation
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
import logging
import subprocess

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

app = FastAPI(title="Market Pulse Builder Integration API", version="1.0")

# Enable CORS for SLM Builder UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Data Models
# ============================================================================

class BuilderConfig(BaseModel):
    """Configuration exported from SLM Builder"""
    modelName: str
    baseModel: str
    trainingMethod: str
    epochs: int
    batchSize: int
    learningRate: str
    dataSources: Dict[str, bool]
    deployTarget: str
    refreshInterval: str
    retrainThreshold: int


class DeploymentRequest(BaseModel):
    """Request to deploy a model"""
    config: BuilderConfig
    apiKeys: Optional[Dict[str, str]] = None


class ModelDeployment(BaseModel):
    """Metadata for a deployed model"""
    id: str
    name: str
    baseModel: str
    deployedAt: str
    status: str
    endpoint: str
    metrics: Optional[Dict[str, Any]] = None


# ============================================================================
# Storage
# ============================================================================

CONFIG_DIR = Path("data/builder-configs")
DEPLOYMENT_DIR = Path("data/deployments")
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
DEPLOYMENT_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================================
# Helper Functions
# ============================================================================

def load_current_config() -> Optional[Dict]:
    """Load current Market Pulse SLM config"""
    config_path = Path("slm-config.json")
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return None


def save_builder_config(config: BuilderConfig, filename: str = None) -> str:
    """Save builder config to disk"""
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"market-pulse-{timestamp}.json"

    filepath = CONFIG_DIR / filename
    with open(filepath, "w") as f:
        json.dump(config.dict(), f, indent=2)

    log.info(f"Saved builder config to {filepath}")
    return str(filepath)


def load_deployments() -> List[Dict]:
    """Load all deployment metadata"""
    deployments = []
    if DEPLOYMENT_DIR.exists():
        for file in DEPLOYMENT_DIR.glob("*.json"):
            try:
                with open(file) as f:
                    deployments.append(json.load(f))
            except Exception as e:
                log.warning(f"Error loading deployment {file}: {e}")
    return sorted(deployments, key=lambda x: x.get("deployedAt", ""), reverse=True)


def get_live_metrics() -> Dict[str, Any]:
    """Fetch live metrics from orchestrator"""
    metrics_file = Path("training/eval_metrics.json")
    signals_file = Path("data/market_signals.jsonl")

    metrics = {}
    if metrics_file.exists():
        try:
            with open(metrics_file) as f:
                metrics = json.load(f)
        except:
            pass

    # Count signals in last hour
    signals_1h = 0
    if signals_file.exists():
        cutoff = datetime.now() - timedelta(hours=1)
        try:
            with open(signals_file) as f:
                for line in f:
                    signal = json.loads(line)
                    ts = datetime.fromisoformat(signal.get("timestamp", ""))
                    if ts > cutoff:
                        signals_1h += 1
        except:
            pass

    return {
        "timestamp": datetime.now().isoformat(),
        "accuracy_24h": metrics.get("signal_accuracy_24h", 0.0),
        "win_rate": metrics.get("win_rate", 0.0),
        "latency_p95_ms": metrics.get("latency_p95_ms", 0.0),
        "signals_24h": metrics.get("total_signals", 0),
        "signals_1h": signals_1h,
        "sharpe_ratio": metrics.get("sharpe_ratio", 0.0),
        "model_version": metrics.get("model_version", "unknown")
    }


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "Market Pulse Builder Integration",
        "version": "1.0"
    }


@app.get("/api/builder/current-config")
async def get_current_config():
    """Get current Market Pulse SLM configuration"""
    config = load_current_config()
    if not config:
        raise HTTPException(status_code=404, detail="No configuration found")
    return config


@app.post("/api/builder/validate-config")
async def validate_config(config: BuilderConfig):
    """Validate a builder configuration"""
    errors = []

    # Validate model name
    if not config.modelName or len(config.modelName) < 3:
        errors.append("Model name must be at least 3 characters")

    # Validate training params
    if config.epochs < 1 or config.epochs > 20:
        errors.append("Epochs must be between 1 and 20")

    if config.batchSize < 1 or config.batchSize > 32:
        errors.append("Batch size must be between 1 and 32")

    # Check at least one data source
    if not any(config.dataSources.values()):
        errors.append("At least one data source must be selected")

    # Check retraining threshold
    if config.retrainThreshold < 50 or config.retrainThreshold > 90:
        errors.append("Retraining threshold must be between 50 and 90")

    if errors:
        return {
            "valid": False,
            "errors": errors
        }

    return {
        "valid": True,
        "errors": [],
        "warnings": []
    }


@app.post("/api/builder/save-config")
async def save_config(config: BuilderConfig):
    """Save a builder configuration"""
    # Validate first
    validation = await validate_config(config)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=f"Validation failed: {validation['errors']}")

    filepath = save_builder_config(config)

    return {
        "status": "saved",
        "filepath": filepath,
        "config": config.dict()
    }


@app.post("/api/builder/export-config")
async def export_config(config: BuilderConfig):
    """Export config in formats compatible with SLM Builder and Market Pulse"""
    # Save the builder config
    filepath = save_builder_config(config)

    # Generate SLM Builder config format (if applicable)
    slm_builder_config = {
        "name": config.modelName,
        "domain": "financial-markets",
        "task": "market-sentiment",
        "baseModel": config.baseModel,
        "path": "finetune",
        "method": config.trainingMethod,
        "framework": "unsloth",
        "epochs": config.epochs,
        "batch": config.batchSize,
        "lr": config.learningRate,
        "dataSources": config.dataSources,
        "deployTarget": config.deployTarget
    }

    return {
        "status": "exported",
        "builderConfig": config.dict(),
        "slmBuilderFormat": slm_builder_config,
        "savedPath": filepath
    }


@app.post("/api/builder/deploy")
async def deploy_model(request: DeploymentRequest, background_tasks: BackgroundTasks):
    """Deploy a model with given configuration"""
    config = request.config

    # Create deployment record
    deployment_id = f"deploy-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    deployment_record = {
        "id": deployment_id,
        "name": config.modelName,
        "baseModel": config.baseModel,
        "deployedAt": datetime.now().isoformat(),
        "status": "deploying",
        "endpoint": f"http://localhost:8000/api/market-pulse/signal",
        "config": config.dict(),
        "metrics": None
    }

    # Save deployment record
    deployment_file = DEPLOYMENT_DIR / f"{deployment_id}.json"
    with open(deployment_file, "w") as f:
        json.dump(deployment_record, f, indent=2)

    # Start deployment in background
    background_tasks.add_task(
        run_deployment,
        deployment_id,
        config
    )

    return {
        "status": "deployment_started",
        "deploymentId": deployment_id,
        "endpoint": deployment_record["endpoint"]
    }


async def run_deployment(deployment_id: str, config: BuilderConfig):
    """Background task: run actual deployment"""
    deployment_file = DEPLOYMENT_DIR / f"{deployment_id}.json"

    try:
        log.info(f"[Deployment {deployment_id}] Starting deployment...")

        # Step 1: Save config
        save_builder_config(config, "current-deployment.json")

        # Step 2: Seed training data if needed
        log.info("[Deployment] Seeding training data...")
        subprocess.run(
            ["python", "data/seed_training_data.py", "5000"],
            timeout=60,
            capture_output=True
        )

        # Step 3: Run orchestrator hourly loop
        log.info("[Deployment] Starting orchestrator...")
        result = subprocess.run(
            ["python", "orchestrate.py", "hourly", "0"],
            timeout=600,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            raise Exception(f"Orchestrator failed: {result.stderr}")

        # Step 4: Update deployment status
        with open(deployment_file) as f:
            deployment = json.load(f)

        deployment["status"] = "running"
        deployment["metrics"] = get_live_metrics()

        with open(deployment_file, "w") as f:
            json.dump(deployment, f, indent=2)

        log.info(f"[Deployment {deployment_id}] Deployment successful")

    except Exception as e:
        log.error(f"[Deployment {deployment_id}] Failed: {e}")

        # Update status to failed
        try:
            with open(deployment_file) as f:
                deployment = json.load(f)
            deployment["status"] = "failed"
            deployment["error"] = str(e)
            with open(deployment_file, "w") as f:
                json.dump(deployment, f, indent=2)
        except:
            pass


@app.get("/api/builder/deployments")
async def list_deployments():
    """List all model deployments"""
    deployments = load_deployments()
    return {
        "count": len(deployments),
        "deployments": deployments
    }


@app.get("/api/builder/deployments/{deployment_id}")
async def get_deployment(deployment_id: str):
    """Get deployment details and status"""
    deployments = load_deployments()
    for dep in deployments:
        if dep["id"] == deployment_id:
            # Fetch live metrics
            dep["metrics"] = get_live_metrics()
            return dep

    raise HTTPException(status_code=404, detail="Deployment not found")


@app.get("/api/builder/metrics")
async def get_metrics():
    """Get live system metrics"""
    return {
        "status": "ok",
        "metrics": get_live_metrics(),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/builder/signals/latest")
async def get_latest_signals(limit: int = 20):
    """Get latest market signals"""
    signals_file = Path("data/market_signals.jsonl")
    signals = []

    if signals_file.exists():
        with open(signals_file) as f:
            lines = f.readlines()
            for line in lines[-limit:]:
                try:
                    signals.append(json.loads(line))
                except:
                    pass

    return {
        "count": len(signals),
        "signals": signals[::-1],  # Reverse to show newest first
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/builder/retrain")
async def trigger_retrain(background_tasks: BackgroundTasks):
    """Manually trigger model retraining"""
    background_tasks.add_task(run_retrain)

    return {
        "status": "retrain_started",
        "message": "Model retraining initiated",
        "timestamp": datetime.now().isoformat()
    }


async def run_retrain():
    """Background task: run retraining cycle"""
    try:
        log.info("[Retrain] Starting manual retrain cycle...")
        result = subprocess.run(
            ["python", "orchestrate.py", "retrain"],
            timeout=600,
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            log.info("[Retrain] Retraining completed successfully")
        else:
            log.error(f"[Retrain] Failed: {result.stderr}")

    except Exception as e:
        log.error(f"[Retrain] Error: {e}")


@app.get("/api/builder/templates")
async def get_templates():
    """Get pre-configured SLM Builder templates"""
    return {
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
                "dataSources": {
                    "newsapi": True,
                    "yfinance": True,
                    "coingecko": True,
                    "reddit": False
                }
            },
            {
                "id": "market-pulse-social",
                "name": "Market Pulse + Social",
                "description": "With Reddit & Twitter sentiment analysis",
                "baseModel": "qwen3-1.7b",
                "trainingMethod": "qlora",
                "epochs": 4,
                "batchSize": 4,
                "learningRate": "2e-4",
                "dataSources": {
                    "newsapi": True,
                    "yfinance": True,
                    "coingecko": True,
                    "reddit": True
                }
            },
            {
                "id": "market-pulse-large",
                "name": "Market Pulse (Large)",
                "description": "3.8B model for higher accuracy",
                "baseModel": "qwen3-3.8b",
                "trainingMethod": "fullft",
                "epochs": 6,
                "batchSize": 8,
                "learningRate": "1e-4",
                "dataSources": {
                    "newsapi": True,
                    "yfinance": True,
                    "coingecko": True,
                    "reddit": True
                }
            }
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
