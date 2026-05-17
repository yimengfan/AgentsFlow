// @agentsflow/desktop — Electron main entry
// This file bootstraps the Electron app, initializes the flow engine,
// agent registry, local store, and IPC handlers.

export { createApp } from "./main/app.js";
export type { PreloadApi } from "./main/preload.js";
