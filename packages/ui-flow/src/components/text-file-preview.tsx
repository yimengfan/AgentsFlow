import { SURFACE, BORDER, TEXT, TYPO, SPACING } from "./workbench-tokens.js";

interface TextFilePreviewProps {
  /** The file content to display */
  content: string;
  /** The file path (for display in header) */
  filePath: string;
}

/**
 * TextFilePreview — renders plain text file content with line numbers.
 *
 * Used in CenterWorkspace when docType === "text".
 * Uses semantic tokens from workbench-tokens.ts for all styling.
 */
export function TextFilePreview({ content, filePath }: TextFilePreviewProps) {
  const lines = content.split("\n");
  const lineCount = lines.length;
  // Width of the gutter (number of digits in line count + padding)
  const gutterWidth = String(lineCount).length + 2;

  const containerStyle: React.CSSProperties = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: SURFACE.editor,
    color: TEXT.primary,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: TYPO.fontSize,
    lineHeight: 1.6,
  };

  const headerStyle: React.CSSProperties = {
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom: `1px solid ${BORDER.default}`,
    backgroundColor: SURFACE.panel,
    color: TEXT.secondary,
    fontSize: TYPO.smallFontSize,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexShrink: 0,
  };

  const scrollAreaStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: `${SPACING.sm}px 0`,
  };

  const lineStyle = (isEven: boolean): React.CSSProperties => ({
    display: "flex",
    minHeight: `${TYPO.fontSize * 1.6}px`,
    backgroundColor: isEven ? "transparent" : SURFACE.hover,
  });

  const gutterStyle: React.CSSProperties = {
    width: `${gutterWidth}ch`,
    minWidth: `${gutterWidth}ch`,
    textAlign: "right",
    paddingRight: `${SPACING.sm}px`,
    color: TEXT.muted,
    userSelect: "none",
    flexShrink: 0,
  };

  const contentStyle: React.CSSProperties = {
    whiteSpace: "pre",
    paddingRight: `${SPACING.md}px`,
    color: TEXT.primary,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle} title={filePath}>
        {getBaseName(filePath)} — {lineCount} {lineCount === 1 ? "line" : "lines"}
      </div>
      <div style={scrollAreaStyle}>
        {lines.map((line, i) => (
          <div key={i} style={lineStyle(i % 2 === 1)}>
            <span style={gutterStyle}>{i + 1}</span>
            <span style={contentStyle}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Extract the base filename from a full path. */
function getBaseName(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const parts = filePath.split(sep);
  return parts[parts.length - 1] ?? filePath;
}
