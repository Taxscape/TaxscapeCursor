#!/bin/bash

# Function to kill processes on exit
cleanup() {
    echo ""
    echo "Stopping TaxScape Pro..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Load environment variables from .env if present (for GEMINI_API_KEY, etc.)
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Start Backend
echo "Starting Backend API (Port 8001)..."
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!

# Start Frontend
echo "Preparing Next.js frontend..."
pushd frontend >/dev/null
if [ ! -f ".env.local" ] && [ -f "env.local.example" ]; then
    cp env.local.example .env.local
fi
if [ ! -d "node_modules" ]; then
    npm install
fi
echo "Starting Next.js Dev Server (Port 3000)..."
npm run dev -- --hostname localhost --port 3000 &
FRONTEND_PID=$!
popd >/dev/null

echo "========================================="
echo "   TaxScape Pro is Live!"
echo "   Frontend: http://localhost:3000"
echo "   API:      http://localhost:8001/docs"
echo "========================================="
echo "Press Ctrl+C to stop both services."

wait
