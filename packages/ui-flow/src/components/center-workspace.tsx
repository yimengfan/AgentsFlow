import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { FlowEditorSurface } from "./flow-editor-surface.js";
import { TabBar } from "./tab-bar.js";
import { SURFACE } from "./workbench-tokens.js";

/**
 * CenterWorkspace — the main content area containing tabs and editor.
 *
 * Layout invariant: fills the center column of the workbench.
 * Must NOT set width — the workbench shell's PanelGroup controls that.
 */

export function CenterWorkspace() {
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const documents = useWorkspaceStore((s) => s.documents);

  const activeDoc = activeFlowPath ? documents.get(activeFlowPath) : null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: SURFACE.editor,
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <TabBar />

      {/* Editor fills remaining space */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeDoc ? (
          <FlowEditorSurface flowPath={activeDoc.flowPath} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontSize: 14,
      }}
    >
      Open a flow from the Explorer to start editing
    </div>
  );
}