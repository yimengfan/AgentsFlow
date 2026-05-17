import { useEffect, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
  type PanelOnCollapse,
  type PanelOnExpand,
} from "react-resizable-panels";
import { useWorkbenchStore, type LeftViewId } from "../store/workbench-store.js";
import { Toolbar } from "./toolbar.js";
import { ActivityBar } from "./activity-bar.js";
import { ExplorerPane } from "./explorer-pane.js";
import { WorkspacePane } from "./workspace-pane.js";
import { PreviewPane } from "./preview-pane.js";
import { CenterWorkspace } from "./center-workspace.js";
import { AssistantPanel } from "./assistant-panel.js";
import {
  SURFACE,
  RESIZE_HANDLE,
  PANEL_CONSTRAINTS,
} from "./workbench-tokens.js";

/**
 * Workbench — top-level layout frame for the AgentsFlow IDE.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Toolbar                                                         │
 * ├──┬──────────┬───────────────────────────────┬───────────────────┤
 * │  │          │                               │                   │
 * │A │ Explorer │   Center Workspace            │  Assistant Panel  │
 * │c │          │   (Tabs + Canvas/YAML          │  (Chat / Detail)  │
 * │t │          │    + Bottom Preview)           │                   │
 * │i │          │                               │                   │
 * │v │          │                               │                   │
 * │i │          │                               │                   │
 * │t │          │                               │                   │
 * │y │          │                               │                   │
 * ├──┴──────────┴───────────────────────────────┴───────────────────┤
 * │ Status Bar (future)                                             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * LAYOUT INVARIANTS — DO NOT VIOLATE:
 *
 * 1. Workbench is the SOLE owner of the 100vh × 100vw outer frame.
 *    No child may set position:fixed, position:absolute, or 100vh/100vw.
 *
 * 2. The horizontal split is: [ActivityBar + LeftSidebar] | [Center] | [Right].
 *    ActivityBar is always rendered (fixed width). Sidebars are collapsible.
 *
 * 3. Toolbar is always visible at the top (fixed height 40px).
 *
 * 4. Sidebars use react-resizable-panels with `collapsible`.
 *    Panel visibility is driven by WorkbenchStore via ImperativePanelHandle.
 *    Store is the single source of truth; no autoSaveId (avoid state conflict).
 *
 * 5. CenterWorkspace owns its internal vertical split (tabs → editor → bottom).
 *    Workbench does NOT reach into CenterWorkspace internals.
 *
 * 6. All layout dimensions come from workbench-tokens.ts.
 *    No magic numbers in component code.
 */
export function Workbench() {
  const leftSidebarVisible = useWorkbenchStore((s) => s.leftSidebarVisible);
  const rightSidebarVisible = useWorkbenchStore((s) => s.rightSidebarVisible);
  const activeLeftView = useWorkbenchStore((s) => s.activeLeftView);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync left panel collapse/expand with store (programmatic toggle).
  // Use isCollapsed() guard to prevent infinite loops:
  //   store toggle → effect → collapse() → onCollapse callback → store toggle → ...
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (leftSidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [leftSidebarVisible]);

  // Sync right panel collapse/expand with store (programmatic toggle).
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightSidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [rightSidebarVisible]);

  // Callbacks for when the user drags a panel past its min size.
  // These sync the store from the panel library (reverse direction).
  const handleLeftCollapse: PanelOnCollapse = () => {
    const store = useWorkbenchStore.getState();
    if (store.leftSidebarVisible) store.toggleLeftSidebar();
  }; const handleLeftExpand: PanelOnExpand = () => {
    const store = useWorkbenchStore.getState();
    if (!store.leftSidebarVisible) store.toggleLeftSidebar();
  }; const handleRightCollapse: PanelOnCollapse = () => {
    const store = useWorkbenchStore.getState();
    if (store.rightSidebarVisible) store.toggleRightSidebar();
  }; const handleRightExpand: PanelOnExpand = () => {
    const store = useWorkbenchStore.getState();
    if (!store.rightSidebarVisible) store.toggleRightSidebar();
  };
  /** Render the content of the left sidebar based on active view */
  const renderLeftSidebarContent = (view: LeftViewId) => {
    switch (view) {
      case "workspace":
        return <WorkspacePane />;
      case "preview":
        return <PreviewPane />;
      case "explorer":
      default:
        return <ExplorerPane />;
    }
  };
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: SURFACE.editor,
        color: "#e0e0e0",
      }}
    >
      {/* Toolbar — fixed 40px top */}
      <Toolbar />

      {/* Main body — fills remaining space */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <PanelGroup direction="horizontal">
          {/* Left: Activity Bar + Sidebar */}
          <Panel
            ref={leftPanelRef}
            defaultSize={PANEL_CONSTRAINTS.leftSidebar.defaultSize}
            minSize={PANEL_CONSTRAINTS.leftSidebar.minSize}
            maxSize={PANEL_CONSTRAINTS.leftSidebar.maxSize}
            collapsible
            onCollapse={handleLeftCollapse}
            onExpand={handleLeftExpand}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "row",
              }}
            >
              <ActivityBar />
              {renderLeftSidebarContent(activeLeftView)}
            </div>
          </Panel>

          {/* Resize handle */}
          <PanelResizeHandle
            style={{
              width: RESIZE_HANDLE.size,
              background: RESIZE_HANDLE.background,
            }}
          />

          {/* Center: Editor workspace */}
          <Panel minSize={30}>
            <CenterWorkspace />
          </Panel>

          {/* Resize handle */}
          <PanelResizeHandle
            style={{
              width: RESIZE_HANDLE.size,
              background: RESIZE_HANDLE.background,
            }}
          />

          {/* Right: Assistant panel */}
          <Panel
            ref={rightPanelRef}
            defaultSize={PANEL_CONSTRAINTS.rightSidebar.defaultSize}
            minSize={PANEL_CONSTRAINTS.rightSidebar.minSize}
            maxSize={PANEL_CONSTRAINTS.rightSidebar.maxSize}
            collapsible
            onCollapse={handleRightCollapse}
            onExpand={handleRightExpand}
            style={{ overflow: "hidden" }}
          >
            <AssistantPanel />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}