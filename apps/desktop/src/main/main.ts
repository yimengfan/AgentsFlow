/**
 * main.ts — Electron main entry point.
 *
 * This is the file that Electron loads directly.
 * It imports and calls createApp() to bootstrap the entire application.
 */

import { app } from "electron";
import { createApp } from "./app.js";

createApp().catch((err) => {
  console.error("Failed to start AgentsFlow:", err);
  app.quit();
});