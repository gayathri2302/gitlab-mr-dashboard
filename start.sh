#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Starting GitLab MR Dashboard..."

# Install if needed
if [ ! -d "server/node_modules" ]; then
  echo "Installing server dependencies..."
  cd server && npm install && cd ..
fi
if [ ! -d "client/node_modules" ]; then
  echo "Installing client dependencies..."
  cd client && npm install && cd ..
fi

# Start server and client in background
echo "Starting API server on http://localhost:3001"
cd server && npx tsx src/api-server.ts &
SERVER_PID=$!
cd "$DIR"

sleep 2

echo "Starting UI on http://localhost:5173"
cd client && npx vite &
CLIENT_PID=$!
cd "$DIR"

sleep 2
open http://localhost:5173

echo ""
echo "Dashboard running at http://localhost:5173"
echo "API running at http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit 0" INT TERM
wait
