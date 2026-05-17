/**
 * Detect which platform the app is running on.
 *
 * In Electron, window.agentsflow is injected by the preload script.
 * In Web (browser), we fall back to HTTP/REST.
 */

export function detectPlatform(): "electron" | "web" {
  // If window.agentsflow exists, we're in Electron
  if (
    typeof window !== "undefined" &&
    typeof (window as any).agentsflow !== "undefined"
  ) {
    return "electron";
  }
  return "web";
}

/**
 * Create the platform API based on the detected platform.
 */
import type { PlatformApi } from "./platform-api.js";
import { createElectronAdapter } from "./electron-adapter.js";
import { createHttpAdapter } from "./http-adapter.js";

export function createPlatformApi(): PlatformApi {
  const platform = detectPlatform();
  switch (platform) {
    case "electron":
      return createElectronAdapter();
    case "web":
      return createHttpAdapter();
  }
}