import { useWorkbenchStore } from "../store/workbench-store.js";
import { SURFACE, BORDER, TEXT, ACTIVITY_BAR, SPACING } from "./workbench-tokens.js";

/**
 * Toolbar — top bar with branding, view toggles, and action buttons.
 *
 * Layout invariant: fixed height 40px at the top of the workbench.
 * Must NOT set width or position — the workbench shell controls that.
 */
export function Toolbar() {
  const toggleLeftSidebar = useWorkbenchStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useWorkbenchStore((s) => s.toggleRightSidebar);
  const toggleBottomPanel = useWorkbenchStore((s) => s.toggleBottomPanel);
  const leftSidebarVisible = useWorkbenchStore((s) => s.leftSidebarVisible);
  const rightSidebarVisible = useWorkbenchStore((s) => s.rightSidebarVisible);
  const bottomPanelVisible = useWorkbenchStore((s) => s.bottomPanelVisible);

  return (
    <div
      style={{
        height: 40,
        background: SURFACE.toolbar,
        borderBottom: `1px solid ${BORDER.default}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${SPACING.lg}px`,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* Left section: branding + toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
        <button
          onClick={toggleLeftSidebar}
          title="Toggle Explorer"
          style={{
            background: leftSidebarVisible ? SURFACE.sidebar : "transparent",
            border: "none",
            color: TEXT.primary,
            cursor: "pointer",
            padding: `${SPACING.xs}px ${SPACING.sm}px`,
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          ☰
        </button>
        <span style={{ color: TEXT.primary, fontWeight: 600, fontSize: 14 }}>
          AgentsFlow
        </span>
      </div>

      {/* Center section: view toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
        <button
          onClick={toggleBottomPanel}
          title="Toggle Run Preview"
          style={{
            background: bottomPanelVisible ? SURFACE.panel : "transparent",
            border: "none",
            color: bottomPanelVisible ? TEXT.accent : TEXT.secondary,
            cursor: "pointer",
            padding: `${SPACING.xs}px ${SPACING.sm}px`,
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          ▶ Run
        </button>
      </div>

      {/* Right section: assistant toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
        <button
          onClick={toggleRightSidebar}
          title="Toggle Assistant"
          style={{
            background: rightSidebarVisible ? SURFACE.assistant : "transparent",
            border: "none",
            color: rightSidebarVisible ? TEXT.accent : TEXT.secondary,
            cursor: "pointer",
            padding: `${SPACING.xs}px ${SPACING.sm}px`,
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          💬 Assistant
        </button>
      </div>
    </div>
  );
}