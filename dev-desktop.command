#!/usr/bin/env bash
# AgentsFlow — Desktop 开发模式启动脚本
#
# 双击此文件即可启动 AgentsFlow Studio (Electron 桌面模式)
# Vite 开发服务器: http://localhost:5173
#
# 或在终端中运行: ./dev-desktop.command

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 激活 nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
fi

# 验证 Node.js 版本
NODE_VERSION=$(node -v 2>/dev/null || echo "v0.0.0")
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js $NODE_VERSION 版本过低，请安装 Node.js >= 20"
  echo "   运行: nvm install 22"
  read -p "按 Enter 键退出..."
  exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# 设置中国镜像
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY:-https://registry.npmmirror.com}"

# 安装依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  pnpm install
fi

# 启动桌面端开发环境
echo "🖥️  启动 AgentsFlow Studio (Desktop 模式)..."
cd apps/desktop
exec node scripts/dev.js