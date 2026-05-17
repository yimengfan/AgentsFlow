import { createContext, useContext, type ReactNode } from "react";
import type { PlatformApi } from "./platform-api.js";
import { detectPlatform, createPlatformApi } from "./detect.js";

/**
 * React context for the platform adapter.
 * Components use `usePlatform()` to access the backend.
 */
const PlatformContext = createContext<PlatformApi | null>(null);

/**
 * PlatformProvider — wraps the app and injects the correct platform adapter.
 *
 * Auto-detects Electron vs Web and creates the appropriate backend.
 * Optionally accepts an explicit `api` prop for testing.
 */
export function PlatformProvider({
  api,
  children,
}: {
  api?: PlatformApi;
  children: ReactNode;
}) {
  const platformApi = api ?? createPlatformApi();
  return (
    <PlatformContext.Provider value={platformApi}>
      {children}
    </PlatformContext.Provider>
  );
}

/**
 * Hook — access the platform API from any component.
 *
 * ```ts
 * const { flow, run, agent } = usePlatform();
 * const flows = await flow.list();
 * ```
 */
export function usePlatform(): PlatformApi {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within a <PlatformProvider>");
  }
  return ctx;
}