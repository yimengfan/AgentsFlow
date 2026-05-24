/**
 * Icon components for the workbench UI.
 *
 * All icons are inline SVGs with stroke-based (line art) style,
 * matching the uipro Dark OLED theme:
 * - 1.5px stroke width
 * - stroke="currentColor" to inherit parent text color
 * - fill="none" (outline style, not filled)
 * - 20×20 viewBox (scaled by parent fontSize)
 * - Round stroke-linecap and stroke-linejoin for smooth corners
 *
 * Layout invariant: icons render at 20×20px within a button container.
 * They MUST use currentColor so hover/active states automatically
 * apply the correct color via the parent's CSS color property.
 */

import React from "react";

const ICON_SIZE = 20;
const STROKE_WIDTH = 1.5;
const STROKE_CAP: React.SVGAttributes<SVGSVGElement>["strokeLinecap"] = "round";
const STROKE_JOIN: React.SVGAttributes<SVGSVGElement>["strokeLinejoin"] = "round";

/** Common SVG props shared by all icons. */
const svgProps: React.SVGAttributes<SVGSVGElement> = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: `0 0 ${ICON_SIZE} ${ICON_SIZE}`,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: STROKE_CAP,
  strokeLinejoin: STROKE_JOIN,
};

/**
 * ExplorerIcon — file-tree / folder outline icon.
 * Two stacked file shapes (bottom slightly offset) representing a file tree.
 */
export function ExplorerIcon() {
  return (
    <svg {...svgProps}>
      {/* Folder back */}
      <path d="M3 5.5V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H9.5L8 5H4a1 1 0 0 0-1 .5z" />
      {/* Folder front tab */}
      <path d="M3 9h14" />
    </svg>
  );
}

/**
 * WorkspaceIcon — graph/flow network icon.
 * Three connected nodes with edges, representing a flow graph.
 */
export function WorkspaceIcon() {
  return (
    <svg {...svgProps}>
      {/* Nodes */}
      <circle cx="5" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="10" cy="15" r="2" />
      {/* Edges */}
      <line x1="5" y1="7" x2="10" y2="13" />
      <line x1="15" y1="7" x2="10" y2="13" />
      <line x1="7" y1="5" x2="13" y2="5" />
    </svg>
  );
}

/**
 * PreviewIcon — eye / view icon for previewing runs.
 * Outlined eye shape representing "view" or "preview".
 */
export function PreviewIcon() {
  return (
    <svg {...svgProps}>
      {/* Eye outline */}
      <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z" />
      {/* Pupil */}
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}

/**
 * SettingsIcon — gear icon for application settings.
 * Classic gear/cog outline representing configuration.
 */
export function SettingsIcon() {
  return (
    <svg {...svgProps}>
      {/* Gear outer */}
      <path d="M10 1.5l.7 2.3a.5.5 0 0 0 .4.35l2.3.2a.5.5 0 0 1 .3.85l-1.6 1.7a.5.5 0 0 0-.12.48l.5 2.25a.5.5 0 0 1-.72.55L10 8.3a.5.5 0 0 0-.5 0l-2 1.15a.5.5 0 0 1-.72-.55l.5-2.25a.5.5 0 0 0-.12-.48L5.56 4.5a.5.5 0 0 1 .3-.85l2.3-.2a.5.5 0 0 0 .4-.35L9.26 1.5a.5.5 0 0 1 .88 0z" />
      {/* Center circle */}
      <circle cx="10" cy="7" r="2" />
    </svg>
  );
}