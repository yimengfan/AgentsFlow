import { SURFACE, BORDER, TEXT, SPACING, TYPO } from "./workbench-tokens.js";

/**
 * WorkspacePane — workspace/project management view in the left sidebar.
 *
 * Placeholder: will show workspace configuration, environment variables,
 * and project-level settings.
 *
 * Layout invariant: fills the sidebar content area.
 * Must NOT set width or height — the sidebar panel controls that.
 */

export function WorkspacePane() {
  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          fontWeight: 600,
          color: TEXT.secondary,
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        Workspace
      </div>

      {/* Placeholder content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TEXT.muted,
          fontSize: TYPO.fontSize,
          padding: SPACING.md,
        }}
      >
        Workspace settings coming soon
      </div>
    </div>
  );
}
