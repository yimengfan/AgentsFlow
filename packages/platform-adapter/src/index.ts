// @agentsflow/platform-adapter
// Platform adapter — abstracts IPC (Electron) vs HTTP (Web) backends.
// Provides a React context so UI components can access platform services
// without knowing whether they're running in Electron or a browser.

export { PlatformProvider, usePlatform } from "./platform-context.js";
export type { PlatformApi } from "./platform-api.js";
export { createElectronAdapter } from "./electron-adapter.js";
export { createHttpAdapter } from "./http-adapter.js";
export { detectPlatform } from "./detect.js";