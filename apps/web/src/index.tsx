/**
 * Web app entry point — same as studio but forces web mode.
 *
 * The studio's PlatformProvider will auto-detect web mode
 * and use the HTTP adapter instead of Electron IPC.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Workbench } from "@agentsflow/ui-flow";
import { PlatformProvider, createHttpAdapter } from "@agentsflow/platform-adapter";

function mount(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PlatformProvider api={createHttpAdapter()}>
        <Workbench />
      </PlatformProvider>
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}