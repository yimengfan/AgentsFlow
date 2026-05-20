import { SURFACE, BORDER, TEXT, TYPO, SPACING, ACCENT } from "./workbench-tokens.js";

interface BinaryPlaceholderProps {
  /** The file path (for display) */
  filePath: string;
}

/**
 * BinaryPlaceholder — shown when a binary file is clicked.
 *
 * Displays a clear message that the file cannot be displayed as text.
 * Uses semantic tokens from workbench-tokens.ts for all styling.
 */
export function BinaryPlaceholder({ filePath }: BinaryPlaceholderProps) {
  const containerStyle: React.CSSProperties = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.editor,
    color: TEXT.muted,
    gap: SPACING.md,
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 48,
    opacity: 0.4,
  };

  const messageStyle: React.CSSProperties = {
    fontSize: TYPO.fontSize,
    color: TEXT.secondary,
    textAlign: "center" as const,
  };

  const pathStyle: React.CSSProperties = {
    fontSize: TYPO.smallFontSize,
    color: TEXT.muted,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: `${SPACING.xs}px ${SPACING.sm}px`,
    borderRadius: 4,
    backgroundColor: SURFACE.panel,
    border: `1px solid ${BORDER.default}`,
    maxWidth: "80%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: TYPO.smallFontSize,
    color: ACCENT.alertAmber,
    padding: `${SPACING.xs}px ${SPACING.sm}px`,
    borderRadius: 4,
    border: `1px solid ${ACCENT.alertAmber}33`,
    backgroundColor: `${ACCENT.alertAmber}11`,
  };

  const fileName = getBaseName(filePath);

  return (
    <div style={containerStyle}>
      <span style={iconStyle}>📦</span>
      <div style={messageStyle}>
        <strong>{fileName}</strong> is a binary file
      </div>
      <span style={badgeStyle}>Binary — cannot display</span>
      <span style={pathStyle} title={filePath}>
        {filePath}
      </span>
    </div>
  );
}

/** Extract the base filename from a full path. */
function getBaseName(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const parts = filePath.split(sep);
  return parts[parts.length - 1] ?? filePath;
}
