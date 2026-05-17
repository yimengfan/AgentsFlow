import { useWorkbenchStore, type LeftViewId } from "../store/workbench-store.js";
import { SURFACE, BORDER, TEXT, ACTIVITY_BAR, SPACING } from "./workbench-tokens.js";

/**
 * ActivityBar — narrow vertical icon strip on the far left.
 *
 * Layout invariant: fixed width 48px, full height of the sidebar region.
 * Must NOT set height or position — the workbench shell controls that.
 */

const VIEW_ICONS: ReadonlyArray<{ id: LeftViewId; icon: string; label: string }> = [
  { id: "explorer", icon: "📁", label: "Explorer" },
  { id: "workspace", icon: "🔄", label: "Workspace" },
  { id: "preview", icon: "🔍", label: "Preview" },
];

export function ActivityBar() {
  const activeLeftView = useWorkbenchStore((s) => s.activeLeftView);
  const setActiveLeftView = useWorkbenchStore((s) => s.setActiveLeftView);

  return (
    <div
      style={{
        width: ACTIVITY_BAR.width,
        background: SURFACE.activityBar,
        borderRight: `1px solid ${BORDER.default}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: SPACING.sm,
        gap: SPACING.xs,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {VIEW_ICONS.map((view) => {
        const isActive = activeLeftView === view.id;
        return (
          <button
            key={view.id}
            onClick={() => setActiveLeftView(view.id)}
            title={view.label}
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isActive ? SURFACE.sidebar : "transparent",
              border: "none",
              borderLeft: isActive ? `2px solid ${BORDER.active}` : "2px solid transparent",
              color: isActive ? TEXT.primary : TEXT.secondary,
              cursor: "pointer",
              borderRadius: 4,
              fontSize: 16,
            }}
          >
            {view.icon}
          </button>
        );
      })}
    </div>
  );
}