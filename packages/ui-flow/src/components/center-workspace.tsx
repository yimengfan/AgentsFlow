import { useEffect, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
  type PanelOnCollapse,
  type PanelOnExpand,
} from "react-resizable-panels";
import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { FlowEditorSurface } from "./flow-editor-surface.js";
import { TabBar } from "./tab-bar.js";
import { BottomPreview } from "./bottom-preview.js";
import {
  SURFACE,
  RESIZE_HANDLE,
  PANEL_CONSTRAINTS,
} from "./workbench-tokens.js";

/**
 * CenterWorkspace — the main content area containing tabs, editor, and bottom panel.
 *
 * Layout invariant: fills the center column of the workbench.
 * Must NOT set width — the workbench shell's PanelGroup controls that.
 */

function ResizeHandle({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) {
  return (
    <PanelResizeHandle
      style={{
        [direction === "horizontal" ? "width" : "height"]: RESIZE_HANDLE.size,
        background: RESIZE_HANDLE.background,
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    />
  );
}

export function CenterWorkspace() {
  const bottomPanelVisible = useWorkbenchStore((s) => s.bottomPanelVisible);
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const documents = useWorkspaceStore((s) => s.documents);
  const bottomPanelRef = useRef<ImperativePanelHandle>(null);

  const activeDoc = activeFlowPath ? documents.get(activeFlowPath) : null;

  // Sync bottom panel collapse/expand with store (programmatic toggle).
  // Use isCollapsed() guard to prevent infinite loops.
  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (bottomPanelVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [bottomPanelVisible]);

  // Callbacks for drag-initiated collapse/expand
  const handleBottomCollapse: PanelOnCollapse = () => {
    const store = useWorkbenchStore.getState();
    if (store.bottomPanelVisible) store.toggleBottomPanel();
  }; const handleBottomExpand: PanelOnExpand = () => {
    const store = useWorkbenchStore.getState();
    if (!store.bottomPanelVisible) store.toggleBottomPanel();
  };

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

      {/* Editor + bottom panel */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <PanelGroup direction="vertical">
          <Panel minSize={40}>
            {activeDoc ? (
              <FlowEditorSurface flowPath={activeDoc.flowPath} />
            ) : (
              <EmptyState />
            )}
          </Panel>

          <ResizeHandle direction="vertical" />

          <Panel
            ref={bottomPanelRef}
            defaultSize={PANEL_CONSTRAINTS.bottomPanel.defaultSize}
            minSize={PANEL_CONSTRAINTS.bottomPanel.minSize}
            maxSize={PANEL_CONSTRAINTS.bottomPanel.maxSize}
            collapsible
            onCollapse={handleBottomCollapse}
            onExpand={handleBottomExpand}
          >
            {/* Only render content when panel is visible to avoid wasted DOM */}
            {bottomPanelVisible && <BottomPreview />}
          </Panel>
        </PanelGroup>
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