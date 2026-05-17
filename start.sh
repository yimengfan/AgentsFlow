#!/usr/bin/env bash
# AgentsFlow Development Startup Script
# Usage: ./start.sh
#
# This script activates the correct Node.js version via nvm,
# sets up Chinese mirrors for npm/electron, and launches the dev server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Activate nvm if available
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
else
  echo "⚠️  nvm not found at $NVM_DIR. Ensure Node.js >= 20 is installed."
fi

# Verify Node.js version
NODE_VERSION=$(node -v 2>/dev/null || echo "v0.0.0")
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js $NODE_VERSION is too old. Install Node.js >= 20 (nvm install 22)."
  exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# Set Chinese mirrors for faster downloads
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY:-https://registry.npmmirror.com}"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
fi

# Launch the desktop dev server
echo "🚀 Starting AgentsFlow Studio..."
cd apps/desktop
exec node scripts/dev.js
