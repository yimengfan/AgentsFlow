import React, { useState, useCallback, useRef, useEffect } from "react";
import type { NodeSpec, NodeSpecRegistry } from "@agentsflow/node-spec-registry";
import { SURFACE, BORDER, TEXT, SPACING, TYPO } from "./workbench-tokens.js";

// ─── Category icon mapping ─────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  Loader: "📦",
  Agent: "🤖",
  Control: "🔄",
};

const CATEGORY_ORDER = ["Loader", "Agent", "Control"];

// ─── Port data-type color mapping ──────────────────────────

const PORT_COLORS: Record<string, string> = {
  flow: "#6b7280",
  string: "#22c55e",
  prompt: "#a78bfa",
  documents: "#38bdf8",
  plan: "#f59e0b",
  score: "#f97316",
  any: "#8b5cf6",
  object: "#14b8a6",
  array: "#06b6d4",
  number: "#3b82f6",
  boolean: "#ef4444",
  artifact: "#ec4899",
};

function portColor(dataType: string): string {
  return PORT_COLORS[dataType] ?? "#6b7280";
}

// ─── Props ─────────────────────────────────────────────────

export interface NodeContextMenuProps {
  /** Screen coordinates where the menu should appear */
  readonly x: number;
  readonly y: number;
  /** Resolved registry for the current flow */
  readonly registry: NodeSpecRegistry;
  /** Current per-kind instance counts */
  readonly nodeKindCounts?: ReadonlyMap<string, number>;
  /** Callback when a spec is selected */
  onSelect: (spec: NodeSpec) => void;
  /** Callback to close the menu */
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────

export function NodeContextMenu({ x, y, registry, nodeKindCounts, onSelect, onClose }: NodeContextMenuProps) {
  const [filter, setFilter] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // Start with all top-level categories expanded
    const tree = registry.buildCategoryTree();
    return new Set([...tree.keys()]);
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const tree = registry.buildCategoryTree();

  const sortedTopCategories = [
    ...CATEGORY_ORDER.filter((cat) => tree.has(cat)),
    ...[...tree.keys()]
      .filter((cat) => !CATEGORY_ORDER.includes(cat))
      .sort((left, right) => left.localeCompare(right, "zh-CN")),
  ];

  const lowerFilter = filter.toLowerCase();

  const handleSelect = useCallback(
    (spec: NodeSpec) => {
      onSelect(spec);
    },
    [onSelect],
  );

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  // Position: constrain to viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 1000,
    minWidth: 260,
    maxWidth: 340,
    maxHeight: 480,
    overflow: "auto",
    background: SURFACE.sidebar,
    border: `1px solid ${BORDER.default}`,
    borderRadius: 6,
    padding: 0,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  };

  const searchStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    fontSize: TYPO.fontSize,
    background: SURFACE.editor,
    color: TEXT.primary,
    border: "none",
    borderBottom: `1px solid ${BORDER.default}`,
    outline: "none",
  };

  /** Check if a spec matches the current filter */
  const specMatchesFilter = useCallback(
    (s: NodeSpec) =>
      !lowerFilter ||
      s.label.toLowerCase().includes(lowerFilter) ||
      s.kind.toLowerCase().includes(lowerFilter) ||
      s.category.toLowerCase().includes(lowerFilter) ||
      s.description.toLowerCase().includes(lowerFilter) ||
      s.tags.some((t) => t.toLowerCase().includes(lowerFilter)),
    [lowerFilter],
  );

  return (
    <div ref={menuRef} style={menuStyle}>
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        placeholder="搜索节点…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={searchStyle}
      />

      {/* Hierarchical category tree */}
      {sortedTopCategories.map((topCat) => {
        const subMap = tree.get(topCat);
        if (!subMap) return null;

        // Collect all specs under this top-level category
        const allSpecs: NodeSpec[] = [];
        for (const specs of subMap.values()) {
          allSpecs.push(...specs);
        }

        // Filter specs
        const filteredSpecs = allSpecs.filter(specMatchesFilter);
        if (filteredSpecs.length === 0) return null;

        const hasSubCategories = subMap.size > 1 || (subMap.size === 1 && subMap.has("__root__") === false);
        const isExpanded = expandedCategories.has(topCat);

        return (
          <div key={topCat}>
            {/* Top-level category header (clickable) */}
            <div
              onClick={() => toggleCategory(topCat)}
              style={{
                padding: `${SPACING.xs}px ${SPACING.md}px`,
                fontSize: TYPO.smallFontSize,
                color: TEXT.muted,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: SPACING.xs,
                userSelect: "none",
              }}
            >
              <span style={{ transition: "transform 150ms", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>
                ▶
              </span>
              {CATEGORY_ICONS[topCat] ?? "📁"} {topCat}
            </div>

            {isExpanded && (
              <>
                {[...subMap.entries()].map(([subCat, specs]) => {
                  const subSpecs = specs.filter(specMatchesFilter);
                  if (subSpecs.length === 0) return null;

                  // If subCat is "__root__", render specs directly under the top-level category
                  const isRootSubCat = subCat === "__root__";
                  const displaySubCat = subCat;

                  return (
                    <div key={subCat}>
                      {/* Sub-category header (if not root) */}
                      {!isRootSubCat && (
                        <div
                          style={{
                            padding: `${SPACING.xs}px ${SPACING.md}px ${SPACING.xs}px ${SPACING.lg}px`,
                            fontSize: TYPO.smallFontSize - 1,
                            color: TEXT.muted,
                            fontWeight: 500,
                            opacity: 0.8,
                          }}
                        >
                          {displaySubCat}
                        </div>
                      )}

                      {/* Spec items */}
                      {subSpecs.map((spec) => {
                        const currentCount = nodeKindCounts?.get(spec.kind) ?? 0;
                        const maxedOut = spec.maxInstances > 0 && currentCount >= spec.maxInstances;

                        return (
                          <div
                            key={spec.kind}
                            onClick={() => {
                              if (!maxedOut) {
                                handleSelect(spec);
                              }
                            }}
                            style={{
                              padding: `${SPACING.sm}px ${SPACING.md}px ${SPACING.sm}px ${isRootSubCat ? SPACING.lg : SPACING.xl}px`,
                              cursor: maxedOut ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: SPACING.sm,
                              transition: "background 150ms",
                              opacity: maxedOut ? 0.45 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!maxedOut) {
                                (e.currentTarget as HTMLDivElement).style.background = SURFACE.panel;
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.background = "transparent";
                            }}
                          >
                            <span style={{ fontSize: 14, flexShrink: 0 }}>
                              {iconForSpec(spec)}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: TYPO.fontSize,
                                  color: TEXT.primary,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: SPACING.sm,
                                }}
                              >
                                <span>{spec.label}</span>
                                {spec.maxInstances > 0 ? (
                                  <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
                                    {currentCount}/{spec.maxInstances}
                                  </span>
                                ) : null}
                              </div>
                              {/* Category path badge */}
                              <div
                                style={{
                                  fontSize: TYPO.smallFontSize - 2,
                                  color: TEXT.muted,
                                  marginTop: 1,
                                  opacity: 0.7,
                                }}
                              >
                                {spec.category}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  marginTop: 2,
                                  flexWrap: "wrap",
                                }}
                              >
                                {spec.inputPorts
                                  .filter((p) => p.dataType !== "flow")
                                  .map((p) => (
                                    <span
                                      key={p.portId}
                                      style={{
                                        fontSize: 9,
                                        padding: "1px 4px",
                                        borderRadius: 3,
                                        background: portColor(p.dataType) + "33",
                                        color: portColor(p.dataType),
                                        border: `1px solid ${portColor(p.dataType)}55`,
                                      }}
                                    >
                                      {p.label ?? p.portId}
                                    </span>
                                  ))}
                                {spec.outputPorts
                                  .filter((p) => p.dataType !== "flow")
                                  .map((p) => (
                                    <span
                                      key={p.portId}
                                      style={{
                                        fontSize: 9,
                                        padding: "1px 4px",
                                        borderRadius: 3,
                                        background: portColor(p.dataType) + "33",
                                        color: portColor(p.dataType),
                                        border: `1px solid ${portColor(p.dataType)}55`,
                                      }}
                                    >
                                      {p.label ?? p.portId}
                                    </span>
                                  ))}
                              </div>
                              {maxedOut ? (
                                <div style={{ marginTop: 4, fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
                                  已达到节点实例上限
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {/* No results */}
      {filter && sortedTopCategories.every((topCat) => {
        const subMap = tree.get(topCat);
        if (!subMap) return true;
        for (const specs of subMap.values()) {
          if (specs.some(specMatchesFilter)) return false;
        }
        return true;
      }) && (
        <div
          style={{
            padding: SPACING.md,
            fontSize: TYPO.fontSize,
            color: TEXT.muted,
            textAlign: "center",
          }}
        >
          未找到匹配节点
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function iconForSpec(spec: NodeSpec): string {
  const iconMap: Record<string, string> = {
    globe: "🌐",
    "folder-open": "📂",
    bot: "🤖",
    repeat: "🔁",
    flag: "🚩",
  };
  return iconMap[spec.icon] ?? "📦";
}

// ─── Re-export port color for use in node renderers ────────

export { portColor, PORT_COLORS };
