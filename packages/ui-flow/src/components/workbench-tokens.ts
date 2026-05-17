/**
 * Workbench styling tokens — single source of truth for shell chrome styles.
 *
 * Feature components must NOT define root layout colors, borders, or
 * panel constraint values inline. They should reference these tokens.
 */

/** Surface backgrounds */
export const SURFACE = {
  toolbar: "#1e1e2e",
  activityBar: "#1e1e2e",
  sidebar: "#252536",
  editor: "#1e1e2e",
  panel: "#252536",
  assistant: "#1e1e2e",
} as const;

/** Border colors */
export const BORDER = {
  default: "#333",
  active: "#4f46e5",
} as const;

/** Text colors */
export const TEXT = {
  primary: "#e0e0e0",
  secondary: "#9ca3af",
  muted: "#6b7280",
  accent: "#4f46e5",
} as const;

/** Resize handle */
export const RESIZE_HANDLE = {
  size: 4,
  background: "#333",
  hoverBackground: "#4f46e5",
} as const;

/** Panel constraints (percentage of parent) */
export const PANEL_CONSTRAINTS = {
  leftSidebar: { defaultSize: 20, minSize: 12, maxSize: 40 },
  rightSidebar: { defaultSize: 25, minSize: 15, maxSize: 45 },
  bottomPanel: { defaultSize: 30, minSize: 10, maxSize: 60 },
} as const;

/** Activity bar */
export const ACTIVITY_BAR = {
  width: 48,
} as const;

/** Typography */
export const TYPO = {
  fontSize: 13,
  smallFontSize: 11,
  tabFontSize: 12,
} as const;

/** Spacing */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;