#!/bin/bash
# ==========================================================
# IBVAP — One-Command Master System Launcher
# ==========================================================

echo "=========================================================="
echo "🚀 Starting IBVAP Command Center Platform..."
echo "=========================================================="

# 1. Run Metrics Benchmark
python3 demo/benchmark_metrics.py

# 2. Start FastAPI Backend Server
echo "⚡ Starting FastAPI Backend Server on http://0.0.0.0:8000..."
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait 2 seconds for backend initialization
sleep 2

# 3. Start React Command Center Frontend
echo "💻 Starting React Command Center UI on http://localhost:3001..."
cd frontend && npx vite --port 3001 --host 0.0.0.0 &
FRONTEND_PID=$!

echo "=========================================================="
echo "✅ IBVAP System Operational!"
echo "Backend API:  http://localhost:8000"
echo "Command UI:   http://localhost:3001"
echo "=========================================================="

wait $BACKEND_PID $FRONTEND_PID
