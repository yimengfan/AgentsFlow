import React from "react";
import { createRoot } from "react-dom/client";
import { Workbench } from "@agentsflow/ui-flow";
import { PlatformProvider } from "@agentsflow/platform-adapter";

/**
 * Studio entry point — mounts the React app with the platform adapter.
 *
 * The PlatformProvider injects the correct backend:
 *   - In Electron: uses window.agentsflow IPC bridge
 *   - In Web: uses REST/HTTP adapter
 */
function mount(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }

  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PlatformProvider>
        <Workbench />
      </PlatformProvider>
    </React.StrictMode>,
  );
}

// Mount when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}