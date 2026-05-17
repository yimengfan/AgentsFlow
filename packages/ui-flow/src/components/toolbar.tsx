import { useWorkbenchStore } from "../store/workbench-store.js";
import { SURFACE, BORDER, TEXT, ACTIVITY_BAR, SPACING, BUTTON } from "./workbench-tokens.js";
import { useButtonHover } from "./use-button-hover.js";

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

  const leftBtn = useButtonHover();
  const runBtn = useButtonHover();
  const assistBtn = useButtonHover();

  // Four-state background logic for toggle buttons:
  //   active+hovered → BUTTON.activeBg, active+not-hovered → SURFACE.xxx,
  //   inactive+hovered → BUTTON.hoverBg, inactive+not-hovered → transparent
  const leftBg = leftSidebarVisible
    ? (leftBtn.isHovered ? BUTTON.activeBg : SURFACE.sidebar)
    : leftBtn.hoverBg;
  const runBg = bottomPanelVisible
    ? (runBtn.isHovered ? BUTTON.activeBg : SURFACE.panel)
    : runBtn.hoverBg;
  const assistBg = rightSidebarVisible
    ? (assistBtn.isHovered ? BUTTON.activeBg : SURFACE.assistant)
    : assistBtn.hoverBg;

  // Active toggle text color (accent when active, hook-managed when inactive)
  const leftColor = leftSidebarVisible ? TEXT.primary : leftBtn.buttonStyle.color;
  const runColor = bottomPanelVisible ? TEXT.accent : runBtn.buttonStyle.color;
  const assistColor = rightSidebarVisible ? TEXT.accent : assistBtn.buttonStyle.color;

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
            ...leftBtn.buttonStyle,
            background: leftBg,
            color: leftColor,
            padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
            fontSize: 13,
          }}
          {...leftBtn.hoverProps}
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
            ...runBtn.buttonStyle,
            background: runBg,
            color: runColor,
            padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
            fontSize: 13,
          }}
          {...runBtn.hoverProps}
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
            ...assistBtn.buttonStyle,
            background: assistBg,
            color: assistColor,
            padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
            fontSize: 13,
          }}
          {...assistBtn.hoverProps}
        >
          💬 Assistant
        </button>
      </div>
    </div>
  );
}