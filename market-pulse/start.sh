#!/bin/bash
#
# Market Pulse SLM + SLM Builder Integration Startup Script
# Launches inference API, builder integration API, and orchestration loop
#

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=========================================="
echo "Market Pulse SLM + SLM Builder"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo -e "${YELLOW}Shutting down services...${NC}"
    kill $SERVE_PID 2>/dev/null || true
    kill $BUILDER_PID 2>/dev/null || true
    kill $ORCHESTRATE_PID 2>/dev/null || true
    wait 2>/dev/null || true
    echo -e "${GREEN}All services stopped${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check required files
echo -e "${BLUE}Checking environment...${NC}"
if [ ! -f "slm-config.json" ]; then
    echo -e "${YELLOW}Warning: slm-config.json not found${NC}"
fi

if [ ! -d "data" ]; then
    echo -e "${BLUE}Creating data directory...${NC}"
    mkdir -p data
fi

if [ ! -d "training" ]; then
    echo -e "${BLUE}Creating training directory...${NC}"
    mkdir -p training
fi

if [ ! -d "api" ]; then
    echo -e "${YELLOW}Warning: api directory not found${NC}"
fi

# Check for required Python packages
echo -e "${BLUE}Checking Python environment...${NC}"
python3 -c "import fastapi" 2>/dev/null || {
    echo -e "${YELLOW}Installing FastAPI...${NC}"
    pip install fastapi uvicorn pydantic
}

# Start inference service (Port 8000)
echo -e "${BLUE}Starting Market Pulse Inference Service (port 8000)...${NC}"
python api/serve.py &
SERVE_PID=$!
echo -e "${GREEN}✓ Inference service started (PID: $SERVE_PID)${NC}"
sleep 2

# Start builder integration API (Port 8001)
echo -e "${BLUE}Starting SLM Builder Integration API (port 8001)...${NC}"
python api/builder_integration.py &
BUILDER_PID=$!
echo -e "${GREEN}✓ Builder Integration API started (PID: $BUILDER_PID)${NC}"
sleep 2

# Start orchestration loop
echo -e "${BLUE}Starting Market Pulse Orchestration Loop...${NC}"
python orchestrate.py hourly 0 &
ORCHESTRATE_PID=$!
echo -e "${GREEN}✓ Orchestration loop started (PID: $ORCHESTRATE_PID)${NC}"
sleep 1

# Print access information
echo ""
echo "=========================================="
echo -e "${GREEN}All services running!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}Access the services:${NC}"
echo "  • Market Pulse UI:     http://localhost:8001/static/market-pulse-builder.html"
echo "  • Inference API:       http://localhost:8000/health"
echo "  • Builder Integration: http://localhost:8001/health"
echo ""
echo -e "${BLUE}API Endpoints:${NC}"
echo "  • Signal Generation:   POST http://localhost:8000/api/market-pulse/signal"
echo "  • Latest Signals:      GET  http://localhost:8000/api/market-pulse/latest"
echo "  • Market Brief:        GET  http://localhost:8000/api/market-pulse/brief"
echo "  • Live Metrics:        GET  http://localhost:8001/api/builder/metrics"
echo "  • Deployments:         GET  http://localhost:8001/api/builder/deployments"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo "  • Training:            tail -f training/training_log.jsonl"
echo "  • Signals:             tail -f data/market_signals.jsonl"
echo "  • Metrics:             cat training/eval_metrics.json"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for all background processes
wait
