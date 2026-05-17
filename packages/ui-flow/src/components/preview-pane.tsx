import { SURFACE, BORDER, TEXT, SPACING, TYPO } from "./workbench-tokens.js";

/**
 * PreviewPane — live preview / debug view in the left sidebar.
 *
 * Placeholder: will show a live preview of the running flow,
 * step-by-step execution trace, and debug output.
 *
 * Layout invariant: fills the sidebar content area.
 * Must NOT set width or height — the sidebar panel controls that.
 */

export function PreviewPane() {
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
        Preview
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
        Flow preview coming soon
      </div>
    </div>
  );
}
