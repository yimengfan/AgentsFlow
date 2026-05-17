import React from "react";
import { createRoot } from "react-dom/client";
import { Workbench } from "@agentsflow/ui-flow";

/**
 * Renderer entry point — mounts the React app.
 */
function mount(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }

  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <Workbench />
    </React.StrictMode>,
  );
}

// Mount when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
