#!/usr/bin/env python3
"""
Market Pulse SLM: Training Data Seeder
Generates synthetic training examples from ingested market data + outcomes
Uses realistic market scenarios to bootstrap the model
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
import logging
import random

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
log = logging.getLogger(__name__)


class TrainingDataSeeder:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def generate_synthetic_examples(self, count: int = 5000) -> List[Dict[str, Any]]:
        """
        Generate synthetic training examples from realistic market scenarios.
        Each example includes: input features + expected signal + outcomes (1h, 24h)
        """
        examples = []
        assets = ["SPY", "QQQ", "IWM", "GLD", "TLT", "DXY",
                  "BITCOIN-USD", "ETHEREUM-USD", "CARDANO-USD", "SOLANA-USD"]

        scenarios = [
            # Bullish scenarios (high sentiment + positive technicals)
            {
                "name": "Bullish Breakout",
                "sentiment_range": (0.5, 1.0),
                "rsi_range": (60, 75),
                "macd_range": (0.5, 2.0),
                "bollinger_range": (0.6, 1.0),
                "price_change_range": (0.5, 3.0),
                "expected_signal": "BUY",
                "confidence": 0.85
            },
            # Bearish scenarios (low sentiment + negative technicals)
            {
                "name": "Bearish Breakdown",
                "sentiment_range": (-1.0, -0.5),
                "rsi_range": (25, 40),
                "macd_range": (-2.0, -0.5),
                "bollinger_range": (0.0, 0.4),
                "price_change_range": (-3.0, -0.5),
                "expected_signal": "SELL",
                "confidence": 0.85
            },
            # Neutral scenarios
            {
                "name": "Neutral/Consolidation",
                "sentiment_range": (-0.3, 0.3),
                "rsi_range": (45, 55),
                "macd_range": (-0.2, 0.2),
                "bollinger_range": (0.4, 0.6),
                "price_change_range": (-0.5, 0.5),
                "expected_signal": "HOLD",
                "confidence": 0.7
            },
            # Overbought (potential pullback)
            {
                "name": "Overbought Signal",
                "sentiment_range": (0.3, 0.8),
                "rsi_range": (70, 85),
                "macd_range": (0.3, 1.5),
                "bollinger_range": (0.75, 1.0),
                "price_change_range": (1.5, 4.0),
                "expected_signal": "HOLD",
                "confidence": 0.75
            },
            # Oversold (potential bounce)
            {
                "name": "Oversold Signal",
                "sentiment_range": (-0.8, -0.3),
                "rsi_range": (15, 30),
                "macd_range": (-1.5, -0.3),
                "bollinger_range": (0.0, 0.25),
                "price_change_range": (-4.0, -1.5),
                "expected_signal": "HOLD",
                "confidence": 0.75
            }
        ]

        for i in range(count):
            scenario = random.choice(scenarios)
            asset = random.choice(assets)
            timestamp = datetime.now() - timedelta(days=random.randint(0, 30))

            # Generate features from scenario ranges
            sentiment = random.uniform(*scenario["sentiment_range"])
            rsi = random.uniform(*scenario["rsi_range"])
            macd = random.uniform(*scenario["macd_range"])
            bollinger = random.uniform(*scenario["bollinger_range"])
            price_change = random.uniform(*scenario["price_change_range"])

            # Realistic news summaries tied to scenario
            news_templates = {
                "Bullish Breakout": [
                    "Strong earnings beat, analyst upgrades bullish",
                    "Federal Reserve pauses rate hikes, market rallies",
                    "Positive economic data supports risk appetite"
                ],
                "Bearish Breakdown": [
                    "Earnings miss drives sell-off, downgrades issued",
                    "Central bank signals more rate hikes ahead",
                    "Recession fears intensify, risk-off sentiment prevails"
                ],
                "Neutral/Consolidation": [
                    "Market consolidates ahead of key data release",
                    "Mixed signals, investors await clarity",
                    "Trading range holds, no clear direction"
                ],
                "Overbought Signal": [
                    "Rally pauses after strong gains, profit taking noted",
                    "Valuation concerns emerge after sharp advance",
                    "Technical resistance approaches, caution advised"
                ],
                "Oversold Signal": [
                    "Oversold conditions present opportunity, analysts say",
                    "Extreme pessimism offers potential support",
                    "Capitulation signals may precede bounce"
                ]
            }

            news_summary = random.choice(news_templates.get(scenario["name"], ["Market trading normally"]))

            # Estimate outcomes (1h, 24h) based on signal quality
            # Higher confidence signals should have better outcomes
            confidence = scenario["confidence"]
            expected_signal = scenario["expected_signal"]

            outcome_1h = "correct" if random.random() < (confidence * 0.7) else (
                "incorrect" if random.random() < 0.5 else "partial"
            )
            outcome_24h = "correct" if random.random() < (confidence * 0.8) else (
                "incorrect" if random.random() < 0.4 else "partial"
            )

            example = {
                "timestamp": timestamp.isoformat(),
                "asset": asset,
                "price_change": price_change,
                "sentiment_score": sentiment,
                "news_summary": news_summary,
                "technical_rsi": rsi,
                "technical_macd": macd,
                "bollinger_position": bollinger,
                "expected_signal": expected_signal,
                "confidence": confidence,
                "scenario": scenario["name"],
                "outcome_1h": outcome_1h,
                "outcome_24h": outcome_24h
            }

            examples.append(example)

        return examples

    def load_and_augment_ingested_data(self, ingested_file: str = "latest_data.jsonl") -> List[Dict[str, Any]]:
        """Load real ingested data and create training examples"""
        filepath = self.data_dir / ingested_file
        if not filepath.exists():
            log.warning(f"Ingested data file {ingested_file} not found")
            return []

        examples = []
        with open(filepath) as f:
            for line in f:
                record = json.loads(line)

                # Create training example from real data
                sentiment = record.get("sentiment_score", 0.0)
                rsi = record.get("technical_rsi", 50)
                macd = record.get("technical_macd", 0)
                bollinger = record.get("bollinger_position", 0.5)
                price_change = record.get("price_change_24h", 0)

                # Derive expected signal from features
                if sentiment > 0.3 and rsi < 70:
                    expected_signal = "BUY"
                    confidence = 0.7 + (sentiment * 0.2)
                elif sentiment < -0.3 and rsi > 30:
                    expected_signal = "SELL"
                    confidence = 0.7 + (abs(sentiment) * 0.2)
                else:
                    expected_signal = "HOLD"
                    confidence = 0.6

                example = {
                    "timestamp": record.get("timestamp", datetime.now().isoformat()),
                    "asset": record.get("asset", "UNKNOWN"),
                    "price_change": price_change,
                    "sentiment_score": sentiment,
                    "news_summary": record.get("news_summary", "Market news available"),
                    "technical_rsi": rsi,
                    "technical_macd": macd,
                    "bollinger_position": bollinger,
                    "expected_signal": expected_signal,
                    "confidence": min(1.0, confidence),
                    "source": "real_ingestion",
                    "outcome_1h": "correct" if random.random() < confidence else "unknown",
                    "outcome_24h": "correct" if random.random() < (confidence * 0.9) else "unknown"
                }

                examples.append(example)

        log.info(f"Augmented {len(examples)} examples from real ingested data")
        return examples

    def save_training_data(self, examples: List[Dict[str, Any]], filename: str = "historical_signals.jsonl"):
        """Save training examples to JSONL file"""
        filepath = self.data_dir / filename
        with open(filepath, "w") as f:
            for example in examples:
                f.write(json.dumps(example) + "\n")

        log.info(f"Saved {len(examples)} training examples to {filepath}")

    def create_dataset(self, synthetic_count: int = 5000, use_real: bool = True) -> int:
        """Generate complete training dataset"""
        log.info("Generating training dataset...")

        # Generate synthetic examples
        synthetic = self.generate_synthetic_examples(count=synthetic_count)
        log.info(f"Generated {len(synthetic)} synthetic examples")

        # Optionally augment with real ingested data
        real = []
        if use_real:
            real = self.load_and_augment_ingested_data()

        # Combine and save
        all_examples = synthetic + real
        self.save_training_data(all_examples)

        return len(all_examples)


def run_seeding(synthetic_count: int = 5000, use_real: bool = True) -> None:
    """Execute training data seeding"""
    seeder = TrainingDataSeeder()
    total = seeder.create_dataset(synthetic_count=synthetic_count, use_real=use_real)
    log.info(f"[OK] Training dataset ready with {total} examples")


if __name__ == "__main__":
    import sys
    synthetic = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    run_seeding(synthetic_count=synthetic)
