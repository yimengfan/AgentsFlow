import { useWorkspaceStore } from "../store/workspace-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, BUTTON } from "./workbench-tokens.js";

/**
 * TabBar — horizontal row of open flow tabs.
 *
 * Layout invariant: fixed height 35px at the top of the center workspace.
 * Must NOT set width — the center panel controls that.
 */

/** Common interactive style for tab items — cursor + transition per uipro spec. */
const tabInteractiveStyle: React.CSSProperties = {
  cursor: "pointer",
  transition: `background-color ${BUTTON.transitionMs}ms ease, color ${BUTTON.transitionMs}ms ease`,
};
export function TabBar() {
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const documents = useWorkspaceStore((s) => s.documents);
  const setActiveFlow = useWorkspaceStore((s) => s.setActiveFlow);
  const closeFlow = useWorkspaceStore((s) => s.closeFlow);

  if (openTabs.length === 0) return null;

  return (
    <div
      style={{
        height: 35,
        background: SURFACE.toolbar,
        borderBottom: `1px solid ${BORDER.default}`,
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {openTabs.map((flowPath) => {
        const doc = documents.get(flowPath);
        const isActive = flowPath === activeFlowPath;
        const name = doc?.flowPath.split("/").pop() ?? flowPath;

        return (
          <div
            key={flowPath}
            onClick={() => setActiveFlow(flowPath)}
            style={{
              ...tabInteractiveStyle,
              display: "flex",
              alignItems: "center",
              gap: SPACING.xs,
              padding: `0 ${SPACING.md}px`,
              background: isActive ? SURFACE.editor : "transparent",
              borderRight: `1px solid ${BORDER.default}`,
              borderBottom: isActive ? "none" : undefined,
              color: isActive ? TEXT.primary : TEXT.secondary,
              fontSize: TYPO.tabFontSize,
              whiteSpace: "nowrap",
              position: "relative",
              minWidth: 0,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </span>
            {doc?.isDirty && (
              <span style={{ color: TEXT.accent, fontSize: 10 }}>●</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFlow(flowPath);
              }}
              style={{
                background: "none",
                border: "1px solid transparent",
                color: TEXT.muted,
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 14,
                lineHeight: 1,
                marginLeft: SPACING.xs,
                borderRadius: BUTTON.borderRadius,
                transition: `color ${BUTTON.transitionMs}ms ease, border-color ${BUTTON.transitionMs}ms ease`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.borderColor = BUTTON.borderHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TEXT.muted; e.currentTarget.style.borderColor = "transparent"; }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}