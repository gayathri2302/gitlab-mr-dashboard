#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/client"

echo "Starting GitLab MR Dashboard (frontend)..."

if [ ! -d "node_modules" ]; then
  echo "Installing client dependencies..."
  npm install
fi

echo ""
echo "Backend (gitlabservice) must be running separately on http://localhost:3001"
echo "Starting UI on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npx vite --open
