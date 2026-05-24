import React from "react";
import { useWorkbenchStore, type LeftViewId } from "../store/workbench-store.js";
import { SURFACE, BORDER, TEXT, ACTIVITY_BAR, SPACING, BUTTON } from "./workbench-tokens.js";
import { useButtonHover } from "./use-button-hover.js";
import { ExplorerIcon, WorkspaceIcon, PreviewIcon, SettingsIcon } from "./icons.js";

/**
 * ActivityBar — narrow vertical icon strip on the far left.
 *
 * Layout invariant: fixed width 48px, full height of the sidebar region.
 * Must NOT set height or position — the workbench shell controls that.
 */

/** Map of view IDs to their SVG icon components (uipro line-art style). */
const VIEW_ICONS: ReadonlyArray<{ id: LeftViewId; Icon: React.FC; label: string }> = [
  { id: "explorer", Icon: ExplorerIcon, label: "Explorer" },
  { id: "workspace", Icon: WorkspaceIcon, label: "Workspace" },
  { id: "preview", Icon: PreviewIcon, label: "Preview" },
];

export function ActivityBar() {
  const activeLeftView = useWorkbenchStore((s) => s.activeLeftView);
  const setActiveLeftView = useWorkbenchStore((s) => s.setActiveLeftView);
  const explorerBtn = useButtonHover();
  const workspaceBtn = useButtonHover();
  const previewBtn = useButtonHover();
  const settingsBtn = useButtonHover();
  const hoverMap = {
    explorer: explorerBtn,
    workspace: workspaceBtn,
    preview: previewBtn,
    settings: settingsBtn,
  } as const;

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
        const { hoverBg, hoverProps, isHovered, buttonStyle } = hoverMap[view.id];
        // Four-state background: active+hovered → BUTTON.activeBg, active+not-hovered → SURFACE.sidebar,
        // inactive+hovered → BUTTON.hoverBg, inactive+not-hovered → transparent
        const bg = isActive
          ? (isHovered ? BUTTON.activeBg : SURFACE.sidebar)
          : hoverBg;
        return (
          <button
            key={view.id}
            onClick={() => setActiveLeftView(view.id)}
            title={view.label}
            style={{
              ...buttonStyle,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: bg,
              borderLeft: isActive ? `2px solid ${BORDER.active}` : "2px solid transparent",
              color: isActive ? TEXT.primary : buttonStyle.color,
              padding: 0,
            }}
            {...hoverProps}
          >
            <view.Icon />
          </button>
        );
      })}

      {/* Spacer to push settings to bottom */}
      <div style={{ flex: 1 }} />

      {/* Settings button — pinned to bottom */}
      {(() => {
        const isActive = activeLeftView === "settings";
        const { hoverBg, hoverProps, isHovered, buttonStyle } = settingsBtn;
        const bg = isActive
          ? (isHovered ? BUTTON.activeBg : SURFACE.sidebar)
          : hoverBg;
        return (
          <button
            onClick={() => setActiveLeftView("settings")}
            title="Settings"
            style={{
              ...buttonStyle,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: bg,
              borderLeft: isActive ? `2px solid ${BORDER.active}` : "2px solid transparent",
              color: isActive ? TEXT.primary : buttonStyle.color,
              padding: 0,
              marginBottom: SPACING.sm,
            }}
            {...hoverProps}
          >
            <SettingsIcon />
          </button>
        );
      })()}
    </div>
  );
}