#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo " SENTINEL AI: Multi-Camera ReID & Journey Tracking System "
echo "=========================================================="

PORT=${PORT:-8080}
echo "Starting backend server on http://localhost:$PORT ..."
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT
