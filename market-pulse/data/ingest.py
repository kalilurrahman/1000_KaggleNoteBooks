#!/usr/bin/env python3
"""
Market Pulse SLM: Data Ingestion Pipeline
Fetches real-time market data from multiple sources (NewsAPI, yfinance, CoinGecko)
Aggregates into unified feature vectors for training and inference
"""

import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
log = logging.getLogger(__name__)


class MarketDataIngester:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.timestamp = datetime.now().isoformat()

    def ingest_news_data(self) -> List[Dict[str, Any]]:
        """Fetch financial news from NewsAPI"""
        api_key = os.getenv("NEWSAPI_KEY")
        if not api_key:
            log.warning("NEWSAPI_KEY not set, using mock data")
            return self._mock_news_data()

        try:
            import requests
            url = "https://newsapi.org/v2/everything"
            params = {
                "q": "(stock market OR cryptocurrency OR trading OR Fed OR inflation)",
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": 50,
                "apiKey": api_key
            }
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            articles = response.json().get("articles", [])

            news_data = []
            for article in articles[:20]:  # Limit to 20 most recent
                news_data.append({
                    "timestamp": datetime.fromisoformat(
                        article["publishedAt"].replace("Z", "+00:00")
                    ).isoformat(),
                    "source": "newsapi",
                    "headline": article.get("title", ""),
                    "summary": article.get("description", ""),
                    "url": article.get("url", ""),
                    "news_source": article.get("source", {}).get("name", "")
                })

            log.info(f"[NewsAPI] Fetched {len(news_data)} articles")
            return news_data
        except Exception as e:
            log.error(f"[NewsAPI] Error: {e}")
            return self._mock_news_data()

    def ingest_stock_data(self, symbols: List[str] = None) -> List[Dict[str, Any]]:
        """Fetch stock OHLCV data and technical indicators from yfinance"""
        if symbols is None:
            symbols = ["SPY", "QQQ", "IWM", "GLD", "TLT", "DXY"]

        try:
            import yfinance as yf
            stock_data = []

            for symbol in symbols:
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="5d", interval="1h")

                    if len(hist) == 0:
                        continue

                    latest = hist.iloc[-1]
                    prev = hist.iloc[-2] if len(hist) > 1 else latest

                    # Simple technical indicators
                    closes = hist["Close"].values
                    rsi = self._calculate_rsi(closes)
                    macd = self._calculate_macd(closes)
                    bollinger_pos = self._calculate_bollinger_position(closes)

                    price_change_24h = (
                        (latest["Close"] - prev["Close"]) / prev["Close"] * 100
                    ) if prev["Close"] > 0 else 0

                    stock_data.append({
                        "timestamp": str(hist.index[-1].isoformat()),
                        "asset": symbol,
                        "source": "yfinance",
                        "price": float(latest["Close"]),
                        "price_change_24h": price_change_24h,
                        "volume": float(latest["Volume"]),
                        "technical_rsi": rsi,
                        "technical_macd": macd,
                        "bollinger_position": bollinger_pos
                    })
                except Exception as e:
                    log.warning(f"[yfinance] Error for {symbol}: {e}")
                    continue

            log.info(f"[yfinance] Fetched data for {len(stock_data)} symbols")
            return stock_data
        except ImportError:
            log.warning("yfinance not installed, using mock stock data")
            return self._mock_stock_data()
        except Exception as e:
            log.error(f"[yfinance] Error: {e}")
            return self._mock_stock_data()

    def ingest_crypto_data(self) -> List[Dict[str, Any]]:
        """Fetch cryptocurrency data from CoinGecko (free API, no auth needed)"""
        try:
            import requests
            crypto_data = []
            coins = ["bitcoin", "ethereum", "cardano", "solana"]

            for coin in coins:
                try:
                    url = f"https://api.coingecko.com/api/v3/simple/price"
                    params = {
                        "ids": coin,
                        "vs_currencies": "usd",
                        "include_market_cap": "true",
                        "include_24hr_vol": "true",
                        "include_24hr_change": "true"
                    }
                    response = requests.get(url, params=params, timeout=10)
                    response.raise_for_status()
                    data = response.json().get(coin, {})

                    crypto_data.append({
                        "timestamp": self.timestamp,
                        "asset": coin.upper() + "-USD",
                        "source": "coingecko",
                        "price": data.get("usd", 0),
                        "price_change_24h": data.get("usd_24h_change", 0),
                        "volume_24h": data.get("usd_24h_vol", 0),
                        "market_cap": data.get("usd_market_cap", 0)
                    })
                except Exception as e:
                    log.warning(f"[CoinGecko] Error for {coin}: {e}")
                    continue

            log.info(f"[CoinGecko] Fetched data for {len(crypto_data)} cryptocurrencies")
            return crypto_data
        except ImportError:
            log.warning("requests not installed, using mock crypto data")
            return self._mock_crypto_data()
        except Exception as e:
            log.error(f"[CoinGecko] Error: {e}")
            return self._mock_crypto_data()

    def aggregate_data(
        self,
        news: List[Dict],
        stocks: List[Dict],
        crypto: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Combine data from all sources into unified feature vectors"""
        aggregated = []

        # Compute sentiment from news (simple heuristic)
        bullish_keywords = [
            "rally", "surge", "gain", "bullish", "up", "bull",
            "positive", "strong", "breakout", "momentum"
        ]
        bearish_keywords = [
            "fall", "drop", "decline", "bearish", "down", "bear",
            "negative", "weak", "crash", "loss"
        ]

        news_sentiment = 0.0
        if news:
            for article in news:
                text = (article.get("headline", "") + " " +
                       article.get("summary", "")).lower()
                bullish_count = sum(text.count(kw) for kw in bullish_keywords)
                bearish_count = sum(text.count(kw) for kw in bearish_keywords)
                sentiment = (bullish_count - bearish_count) / max(
                    bullish_count + bearish_count, 1
                )
                news_sentiment += sentiment
            news_sentiment = news_sentiment / len(news)

        # Aggregate stock + crypto data with news sentiment
        all_assets = stocks + crypto
        for asset_data in all_assets:
            combined_sentiment = (
                news_sentiment * 0.4 +  # News sentiment: 40%
                (asset_data.get("price_change_24h", 0) / 100) * 0.3 +  # Price action: 30%
                0.0  # Social sentiment placeholder: 30% (would come from Reddit/Twitter)
            )
            # Clamp sentiment to [-1, 1]
            combined_sentiment = max(-1, min(1, combined_sentiment))

            aggregated.append({
                "timestamp": asset_data.get("timestamp", self.timestamp),
                "asset": asset_data.get("asset", "UNKNOWN"),
                "price_change_24h": asset_data.get("price_change_24h", 0),
                "sentiment_score": combined_sentiment,
                "news_summary": (news[0].get("headline", "") if news else
                                "Market trading at normal levels"),
                "technical_rsi": asset_data.get("technical_rsi", 50),
                "technical_macd": asset_data.get("technical_macd", 0),
                "bollinger_position": asset_data.get("bollinger_position", 0.5),
                "source": asset_data.get("source", "unknown")
            })

        return aggregated

    def save_ingested_data(self, data: List[Dict[str, Any]], filename: str = "latest_data.jsonl"):
        """Save ingested data to JSONL file"""
        filepath = self.data_dir / filename
        with open(filepath, "a") as f:
            for record in data:
                f.write(json.dumps(record) + "\n")
        log.info(f"Saved {len(data)} records to {filepath}")

    def _calculate_rsi(self, prices, period: int = 14) -> float:
        """Simple RSI calculation"""
        if len(prices) < period + 1:
            return 50.0
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        seed = deltas[:period]
        up = sum([x for x in seed if x > 0]) / period
        down = -sum([x for x in seed if x < 0]) / period
        rs = up / down if down != 0 else 1
        rsi = 100 - (100 / (1 + rs))
        return float(max(0, min(100, rsi)))

    def _calculate_macd(self, prices, fast: int = 12, slow: int = 26) -> float:
        """Simplified MACD calculation"""
        if len(prices) < slow:
            return 0.0
        fast_ema = sum(prices[-fast:]) / fast
        slow_ema = sum(prices[-slow:]) / slow
        return float(fast_ema - slow_ema)

    def _calculate_bollinger_position(self, prices, period: int = 20) -> float:
        """Position within Bollinger Bands (0=lower, 1=upper)"""
        if len(prices) < period:
            return 0.5
        recent = prices[-period:]
        ma = sum(recent) / period
        std = (sum((x - ma) ** 2 for x in recent) / period) ** 0.5
        upper = ma + (std * 2)
        lower = ma - (std * 2)
        current = prices[-1]
        if upper == lower:
            return 0.5
        position = (current - lower) / (upper - lower)
        return float(max(0, min(1, position)))

    def _mock_news_data(self) -> List[Dict[str, Any]]:
        """Return mock news data for testing"""
        return [
            {
                "timestamp": (datetime.now() - timedelta(hours=2)).isoformat(),
                "source": "newsapi",
                "headline": "Fed signals more rate cuts ahead, markets rally",
                "summary": "Federal Reserve suggests inflation cooling may prompt rate reductions",
                "url": "https://example.com/news/fed-rate-cuts",
                "news_source": "Reuters"
            }
        ]

    def _mock_stock_data(self) -> List[Dict[str, Any]]:
        """Return mock stock data for testing"""
        return [
            {
                "timestamp": self.timestamp,
                "asset": "SPY",
                "source": "yfinance",
                "price": 450.25,
                "price_change_24h": 1.8,
                "volume": 2500000,
                "technical_rsi": 62,
                "technical_macd": 0.45,
                "bollinger_position": 0.65
            }
        ]

    def _mock_crypto_data(self) -> List[Dict[str, Any]]:
        """Return mock crypto data for testing"""
        return [
            {
                "timestamp": self.timestamp,
                "asset": "BITCOIN-USD",
                "source": "coingecko",
                "price": 42500,
                "price_change_24h": 2.3,
                "volume_24h": 15000000000,
                "market_cap": 850000000000
            }
        ]


def run_ingestion(dry_run: bool = False) -> None:
    """Execute full data ingestion pipeline"""
    ingester = MarketDataIngester()

    log.info("Starting market data ingestion pipeline...")
    news = ingester.ingest_news_data()
    stocks = ingester.ingest_stock_data()
    crypto = ingester.ingest_crypto_data()

    aggregated = ingester.aggregate_data(news, stocks, crypto)

    if not dry_run:
        ingester.save_ingested_data(aggregated)
        log.info(f"[OK] Ingestion complete: {len(aggregated)} total records")
    else:
        log.info(f"[DRY-RUN] Would save {len(aggregated)} records")
        if aggregated:
            log.info(f"Sample: {json.dumps(aggregated[0], indent=2)}")


if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    run_ingestion(dry_run=dry_run)
