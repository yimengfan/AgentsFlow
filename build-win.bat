@echo off
REM AgentsFlow — Windows 桌面应用打包脚本
REM
REM 双击此文件即可构建 Windows 安装包
REM 产物位于: apps/desktop\dist-electron\

echo ============================================
echo  AgentsFlow - Windows Build Script
echo ============================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install Node.js >= 20.
    pause
    exit /b 1
)

node -v
echo.

REM Set Chinese mirrors
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

REM Install dependencies
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    pnpm install
    echo.
)

REM Build all packages
echo [INFO] Building workspace packages...
pnpm build
echo.

REM Package Windows app
echo [INFO] Packaging Windows application...
cd apps\desktop
npx electron-builder --win
echo.

echo [DONE] Build complete! Output in apps\desktop\dist-electron\
echo.
pause
