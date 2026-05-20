/**
 * Workbench styling tokens — single source of truth for shell chrome styles.
 *
 * Architecture: 3-layer abstraction for one-click theme swapping
 *
 *   Layer 3 — Theme Presets: named color collections (e.g. "darkOled", "darkCatppuccinMocha")
 *   Layer 2 — Palette: raw color values mapped to semantic roles (bgBase → #0A0E27)
 *   Layer 1 — Semantic Tokens: component-facing names (SURFACE.toolbar → palette.bgBase)
 *
 * Components ONLY import from Layer 1. Swapping themes means swapping Layer 3 presets.
 * Layer 2 (palette) is auto-resolved; no component changes needed.
 *
 * This mirrors VS Code's token architecture and makes it trivial
 * to add a new dark theme preset without touching any component code.
 */

// ---------------------------------------------------------------------------
// Layer 2 — Palette (raw color values mapped to semantic roles)
// ---------------------------------------------------------------------------

/** Palette defines raw color values that semantic tokens resolve from.
 * Each key maps to a specific visual role in the UI. */
export type Palette = {
  // Backgrounds — ordered from deepest to lightest
  readonly bgBase: string;       // deepest: editor canvas, center workspace
  readonly bgSurface1: string;  // raised: sidebars, panels
  readonly bgSurface2: string;  // intermediate: toolbar, activity bar
  readonly bgSurface3: string;  // elevated surface: selected items, hover

  // Borders
  readonly borderDefault: string;
  readonly borderActive: string;

  // Text
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textAccent: string;

  // Accent
  readonly accentIndigo: string;
  readonly accentRunGreen: string;
  readonly accentAlertAmber: string;
  readonly accentErrorRed: string;

  // Resize handle
  readonly resizeHandleBg: string;
  readonly resizeHandleHoverBg: string;

  // Button
  readonly btnHoverBg: string;          // hover background for chrome buttons
  readonly btnActiveBg: string;          // active/pressed background
  readonly btnPrimaryBg: string;        // primary CTA background (indigo)
  readonly btnPrimaryHoverBg: string;   // primary CTA hover background
  readonly btnPrimaryText: string;      // primary CTA text (white/light)
  readonly btnBorderHover: string;      // subtle border on hover (1px light accent)
  readonly btnFocusRing: string;        // focus ring color for keyboard navigation
  readonly btnTextHover: string;        // text color on hover (slightly brighter)
};

// ---------------------------------------------------------------------------
// Layer 3 — Theme Presets
// ---------------------------------------------------------------------------

/** A theme preset defines all palette colors for a specific visual identity. */
export interface ThemePreset {
  readonly name: string;
  readonly palette: Palette;
}

/** Dark OLED — deep black backgrounds, midnight blue accents, neon highlights.
 * Inspired by VS Code's default dark theme + uipro "Dark Mode (OLED)" (#7).
 * WCAG AAA contrast, excellent performance, eye-friendly for long sessions. */
export const darkOled: ThemePreset = {
  name: "dark-oled",
  palette: {
    bgBase: "#0A0E27",
    bgSurface1: "#121220",
    bgSurface2: "#1a1b2e",
    bgSurface3: "#232433",

    borderDefault: "#2a2b3d",
    borderActive: "#4f46e5",

    textPrimary: "#e4e4e7",
    textSecondary: "#9ca3af",
    textMuted: "#6b7280",
    textAccent: "#4f46e5",

    accentIndigo: "#4f46e5",
    accentRunGreen: "#22C55E",
    accentAlertAmber: "#F59E0B",
    accentErrorRed: "#EF4444",

    resizeHandleBg: "#2a2b3d",
    resizeHandleHoverBg: "#4f46e5",

    btnHoverBg: "#1e1f2e",
    btnActiveBg: "#2d2e3f",
    btnPrimaryBg: "#4f46e5",
    btnPrimaryHoverBg: "#4338ca",
    btnPrimaryText: "#ffffff",
    btnBorderHover: "#3a3b4f",
    btnFocusRing: "#4f46e5",
    btnTextHover: "#f4f4f5",
  },
};

/** Dark Catppuccin Mocha — warm brown tones, soft contrast.
 * Inspired by Catppuccin Mocha community theme.
 * Good for warmth, reduces harshness of pure OLED black. */
export const darkCatppuccinMocha: ThemePreset = {
  name: "dark-catppuccin-mocha",
  palette: {
    bgBase: "#1e1e2e",
    bgSurface1: "#252536",
    bgSurface2: "#302741",
    bgSurface3: "#45475a",

    borderDefault: "#313244",
    borderActive: "#4f46e5",

    textPrimary: "#cdd6f4",
    textSecondary: "#9ca3af",
    textMuted: "#6b7280",
    textAccent: "#4f46e5",

    accentIndigo: "#4f46e5",
    accentRunGreen: "#22C55E",
    accentAlertAmber: "#F59E0B",
    accentErrorRed: "#EF4444",

    resizeHandleBg: "#313244",
    resizeHandleHoverBg: "#4f46e5",

    btnHoverBg: "#45475a",
    btnActiveBg: "#585b70",
    btnPrimaryBg: "#4f46e5",
    btnPrimaryHoverBg: "#4338ca",
    btnPrimaryText: "#ffffff",
    btnBorderHover: "#6c6f85",
    btnFocusRing: "#4f46e5",
    btnTextHover: "#f5f5f5",
  },
};

/** Dark One Dark — balanced dark with subtle blue undertone.
 * Inspired by Atom One Dark theme.
 * Professional, balanced, good for extended coding sessions. */
export const darkOneDark: ThemePreset = {
  name: "dark-one-dark",
  palette: {
    bgBase: "#282c34",
    bgSurface1: "#2c313a",
    bgSurface2: "#333842",
    bgSurface3: "#3d4450",

    borderDefault: "#3e4451",
    borderActive: "#528bff",

    textPrimary: "#d4d4d4",
    textSecondary: "#9da5af",
    textMuted: "#636d83",
    textAccent: "#528bff",

    accentIndigo: "#528bff",
    accentRunGreen: "#22C55E",
    accentAlertAmber: "#F59E0B",
    accentErrorRed: "#EF4444",

    resizeHandleBg: "#3e4451",
    resizeHandleHoverBg: "#528bff",

    btnHoverBg: "#3d4450",
    btnActiveBg: "#495162",
    btnPrimaryBg: "#528bff",
    btnPrimaryHoverBg: "#4080f6",
    btnPrimaryText: "#ffffff",
    btnBorderHover: "#5c6370",
    btnFocusRing: "#528bff",
    btnTextHover: "#e5e5e5",
  },
};

// ---------------------------------------------------------------------------
// Layer 1 — Semantic Tokens (component-facing)
// ---------------------------------------------------------------------------

/** Semantic tokens — the stable API that components consume.
 * Resolved from the active theme preset at runtime. */
export type SemanticTokens = {
  readonly SURFACE: {
    readonly toolbar: string;
    readonly activityBar: string;
    readonly sidebar: string;
    readonly editor: string;
    readonly panel: string;
    readonly assistant: string;
    readonly hover: string;
    readonly input: string;
  };
  readonly BORDER: {
    readonly default: string;
    readonly active: string;
  };
  readonly TEXT: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
    readonly accent: string;
  };
  readonly RESIZE_HANDLE: {
    readonly size: number;
    readonly background: string;
    readonly hoverBackground: string;
  };
  readonly PANEL_CONSTRAINTS: {
    readonly leftSidebar: { readonly defaultSize: number; readonly minSize: number; readonly maxSize: number };
    readonly rightSidebar: { readonly defaultSize: number; readonly minSize: number; readonly maxSize: number };
    readonly bottomPanel: { readonly defaultSize: number; readonly minSize: number; readonly maxSize: number };
  };
  readonly ACTIVITY_BAR: {
    readonly width: number;
  };
  readonly TYPO: {
    readonly fontSize: number;
    readonly smallFontSize: number;
    readonly tabFontSize: number;
  };
  readonly SPACING: {
    readonly xs: number;
    readonly sm: number;
    readonly md: number;
    readonly lg: number;
    readonly xl: number;
  };
  readonly ACCENT: {
    readonly indigo: string;
    readonly runGreen: string;
    readonly alertAmber: string;
    readonly errorRed: string;
  };
  readonly BUTTON: {
    readonly hoverBg: string;          // hover background for chrome buttons
    readonly activeBg: string;          // active/pressed background
    readonly primaryBg: string;        // primary CTA background
    readonly primaryHoverBg: string;   // primary CTA hover background
    readonly primaryText: string;      // primary CTA text
    readonly borderRadius: number;     // consistent border radius (6px per uipro dark spec)
    readonly borderHover: string;      // subtle 1px border on hover for depth
    readonly focusRing: string;        // keyboard focus ring color (3px)
    readonly transitionMs: number;     // smooth transition duration (200ms per uipro)
    readonly textHover: string;        // brighter text on hover
    readonly paddingX: number;         // horizontal padding
    readonly paddingY: number;         // vertical padding
    readonly height: number;           // minimum touch height (28px)
  };
};

/** Resolve semantic tokens from a theme preset. */
function resolveTokens(preset: ThemePreset): SemanticTokens {
  const p = preset.palette;
  return {
    SURFACE: {
      toolbar: p.bgSurface2,
      activityBar: p.bgSurface2,
      sidebar: p.bgSurface1,
      editor: p.bgBase,
      panel: p.bgSurface1,
      assistant: p.bgBase,
      hover: p.bgSurface3,
      input: p.bgBase,
    },

    BORDER: {
      default: p.borderDefault,
      active: p.borderActive,
    },

    TEXT: {
      primary: p.textPrimary,
      secondary: p.textSecondary,
      muted: p.textMuted,
      accent: p.textAccent,
    },

    RESIZE_HANDLE: {
      size: 4,
      background: p.resizeHandleBg,
      hoverBackground: p.resizeHandleHoverBg,
    },

    PANEL_CONSTRAINTS: {
      leftSidebar: { defaultSize: 20, minSize: 12, maxSize: 40 },
      rightSidebar: { defaultSize: 25, minSize: 15, maxSize: 45 },
      bottomPanel: { defaultSize: 30, minSize: 10, maxSize: 60 },
    },

    ACTIVITY_BAR: {
      width: 48,
    },

    TYPO: {
      fontSize: 13,
      smallFontSize: 11,
      tabFontSize: 12,
    },

    SPACING: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
    },

    ACCENT: {
      indigo: p.accentIndigo,
      runGreen: p.accentRunGreen,
      alertAmber: p.accentAlertAmber,
      errorRed: p.accentErrorRed,
    },

    BUTTON: {
      hoverBg: p.btnHoverBg,
      activeBg: p.btnActiveBg,
      primaryBg: p.btnPrimaryBg,
      primaryHoverBg: p.btnPrimaryHoverBg,
      primaryText: p.btnPrimaryText,
      borderRadius: 6,                     // 6px per uipro dark spec
      borderHover: p.btnBorderHover,       // 1px subtle border on hover
      focusRing: p.btnFocusRing,           // keyboard focus ring
      transitionMs: 200,                   // uipro: smooth 150-300ms transitions
      textHover: p.btnTextHover,           // brighter text on hover
      paddingX: 8,                         // 8px horizontal
      paddingY: 4,                         // 4px vertical
      height: 28,                          // minimum touch height
    },
  };
}

// ---------------------------------------------------------------------------
// Active Theme (exported for consumption)
// ---------------------------------------------------------------------------

/** All available theme presets. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  darkOled,
  darkCatppuccinMocha,
  darkOneDark,
];

/** Active theme — resolved semantic tokens for the currently selected preset.
 * Change the argument to swap themes. One line change, all components re-themed. */
export const tokens: SemanticTokens = resolveTokens(darkOled);

/** Convenience: get a theme preset by name. */
export function getThemePreset(name: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.name === name);
}

/** Convenience: resolve tokens for a named preset. */
export function resolveThemeTokens(name: string): SemanticTokens {
  const preset = getThemePreset(name);
  if (!preset) throw new Error(`Unknown theme preset: "${name}"`);
  return resolveTokens(preset);
}

// ---------------------------------------------------------------------------
// Backward-compatible named re-exports (Layer 1 stable API)
// ---------------------------------------------------------------------------

/** Surface backgrounds */
export const SURFACE = tokens.SURFACE;

/** Border colors */
export const BORDER = tokens.BORDER;

/** Text colors */
export const TEXT = tokens.TEXT;

/** Resize handle */
export const RESIZE_HANDLE = tokens.RESIZE_HANDLE;

/** Panel constraints (percentage of parent) */
export const PANEL_CONSTRAINTS = tokens.PANEL_CONSTRAINTS;

/** Activity bar */
export const ACTIVITY_BAR = tokens.ACTIVITY_BAR;

/** Typography */
export const TYPO = tokens.TYPO;

/** Spacing */
export const SPACING = tokens.SPACING;

/** Accent colors */
export const ACCENT = tokens.ACCENT;

/** Button styles */
export const BUTTON = tokens.BUTTON;