#!/usr/bin/env node

/**
 * dev.js — Development startup script for AgentsFlow Desktop.
 *
 * What it does:
 *   1. Builds all workspace packages (pnpm -r run build)
 *   2. Bundles the Electron main process with esbuild
 *   3. Starts the Vite dev server for the renderer
 *   4. Launches Electron pointing at the Vite dev server
 *
 * Prerequisites:
 *   - Node.js >= 20 (use nvm: `nvm install 22 && nvm use 22`)
 *   - pnpm 9+ (corepack prepare pnpm@9.15.4 --activate)
 *   - Dependencies installed: `pnpm install`
 *
 * Usage:
 *   node scripts/dev.js
 *
 * Or from the monorepo root:
 *   pnpm dev
 */

import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(tag, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${tag}] ${msg}`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", cwd: PROJECT_ROOT, ...opts });
}

function ensureElectron() {
  try {
    const electronPath = require.resolve("electron", { paths: [PROJECT_ROOT] });
    // The electron package exports the path to the binary
    const electronBin = require("electron");
    return electronBin;
  } catch {
    log("ERROR", "Electron not found. Run: pnpm install");
    process.exit(1);
  }
}

// ─── Step 1: Build workspace packages ───────────────────────────────────────

log("BUILD", "Building workspace packages...");
try {
  run("pnpm --filter '!@agentsflow/desktop' -r run build");
} catch {
  log("WARN", "Some workspace packages failed to build. Continuing...");
}

// ─── Step 2: Bundle main process with esbuild ──────────────────────────────

log("BUILD", "Bundling Electron main process...");

const esbuildBin = path.resolve(
  PROJECT_ROOT,
  "node_modules/.pnpm/esbuild@*/node_modules/.bin/esbuild",
);

// Find esbuild
let esbuildPath;
try {
  // Try the project-local esbuild first
  const localEsbuild = path.join(PROJECT_ROOT, "node_modules", ".bin", "esbuild");
  if (fs.existsSync(localEsbuild)) {
    esbuildPath = localEsbuild;
  } else {
    // Fall back to finding it via require.resolve
    const esbuildDir = path.dirname(require.resolve("esbuild", { paths: [PROJECT_ROOT] }));
    esbuildPath = path.join(esbuildDir, "..", ".bin", "esbuild");
  }
} catch {
  log("ERROR", "esbuild not found. Install it: pnpm add -D esbuild");
  process.exit(1);
}

const mainEntry = path.join(PROJECT_ROOT, "src/main/main.ts");
const preloadEntry = path.join(PROJECT_ROOT, "src/main/preload.ts");
const mainOutDir = path.join(PROJECT_ROOT, "dist/main");

fs.mkdirSync(mainOutDir, { recursive: true });

try {
  // Bundle main process
  run(
    `"${esbuildPath}" "${mainEntry}" ` +
      `--bundle --platform=node --format=esm ` +
      `--outfile="${path.join(mainOutDir, "app.js")}" ` +
      `--external:electron --external:better-sqlite3 ` +
      `--sourcemap`,
  );

  // Bundle preload script
  run(
    `"${esbuildPath}" "${preloadEntry}" ` +
      `--bundle --platform=node --format=esm ` +
      `--outfile="${path.join(mainOutDir, "preload.js")}" ` +
      `--external:electron ` +
      `--sourcemap`,
  );
} catch {
  log("ERROR", "Failed to bundle main process. Check esbuild output above.");
  process.exit(1);
}

log("BUILD", "Main process bundled successfully.");

// ─── Step 3: Start Vite dev server ──────────────────────────────────────────

log("VITE", "Starting Vite dev server for renderer...");

const viteBin = path.join(PROJECT_ROOT, "node_modules", ".bin", "vite");
const viteProc = spawn(
  viteBin,
  ["--config", path.join(PROJECT_ROOT, "vite.config.ts")],
  {
    cwd: PROJECT_ROOT,
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
    },
  },
);

let viteReady = false;

viteProc.stdout.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output);
  if (output.includes("Local:") || output.includes("ready in")) {
    viteReady = true;
    launchElectron();
  }
});

viteProc.stderr.on("data", (data) => {
  process.stderr.write(data);
});

// ─── Step 4: Launch Electron ────────────────────────────────────────────────

function launchElectron() {
  const electronBin = ensureElectron();
  log("ELECTRON", "Launching Electron...");

  const electronProc = spawn(
    electronBin,
    [path.join(mainOutDir, "app.js")],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
      },
    },
  );

  electronProc.on("close", (code) => {
    log("ELECTRON", `Electron exited with code ${code}`);
    viteProc.kill();
    process.exit(code ?? 0);
  });

  electronProc.on("error", (err) => {
    log("ERROR", `Electron failed to start: ${err.message}`);
    viteProc.kill();
    process.exit(1);
  });
}

// Fallback: if Vite doesn't print "ready" within 10s, try launching anyway
setTimeout(() => {
  if (!viteReady) {
    log("VITE", "Vite may still be starting... attempting to launch Electron");
    viteReady = true;
    launchElectron();
  }
}, 10000);

// Handle cleanup
process.on("SIGINT", () => {
  log("SHUTDOWN", "Received SIGINT, cleaning up...");
  viteProc.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  viteProc.kill();
  process.exit(0);
});
