import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { AgentTurnUsage, ToolCallSummary } from "@agentsflow/agent-contracts";
import { usePlatform } from "@agentsflow/platform-adapter";
import { useWorkbenchStore, type RightViewId } from "../store/workbench-store.js";
import {
  useRuntimeStore,
  type PromptSourceRef,
  type RunTimelineEntry,
  type LocalRunRecord,
  type NodeDebugState,
} from "../store/runtime-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";
import { useButtonHover, usePrimaryButtonHover } from "./use-button-hover.js";

// ─── Status badge helpers ──────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case "running": return "⟳";
    case "completed": return "✓";
    case "failed": return "✗";
    default: return "○";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "running": return ACCENT.alertAmber;
    case "completed": return ACCENT.runGreen;
    case "failed": return ACCENT.errorRed;
    default: return TEXT.muted;
  }
}

function runStateLabel(state: string): string {
  switch (state) {
    case "running": return "Running";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "paused": return "Paused";
    case "interrupted": return "Interrupted";
    default: return "Idle";
  }
}

// ─── Formatting helpers ────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatUsage(usage: AgentTurnUsage | undefined): string | null {
  if (!usage) return null;
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`in ${usage.inputTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`out ${usage.outputTokens}`);
  if (usage.totalTokens !== undefined) parts.push(`total ${usage.totalTokens}`);
  if (usage.durationMs !== undefined) parts.push(`${usage.durationMs}ms`);
  if (usage.steps !== undefined) parts.push(`${usage.steps} steps`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatPromptSources(promptSources: readonly PromptSourceRef[]): string {
  return promptSources
    .map((source) => {
      const value = source.value ? `\n${source.value}` : "";
      return `[${source.scope}] ${source.label}${value}`;
    })
    .join("\n\n");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "…";
}

// ─── Inline collapsible disclosure ─────────────────────────

function renderDisclosure(title: string, content: string, key: string, defaultOpen = false): JSX.Element {
  return (
    <details
      key={key}
      open={defaultOpen}
      style={{
        border: `1px solid ${BORDER.default}`,
        borderRadius: 4,
        background: SURFACE.editor,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: `${SPACING.xs}px ${SPACING.sm}px`,
          color: TEXT.secondary,
          fontSize: TYPO.smallFontSize,
          userSelect: "none",
        }}
      >
        {title}
      </summary>
      <div
        style={{
          padding: `0 ${SPACING.sm}px ${SPACING.sm}px`,
          color: TEXT.muted,
          fontSize: TYPO.smallFontSize,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "pre-wrap",
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        {content}
      </div>
    </details>
  );
}

// ─── Avatar component ──────────────────────────────────────

function Avatar({ role, nodeKind }: { role: string; nodeKind?: string | undefined }) {
  const emoji = role === "user" ? "👤" : role === "system" ? "⚙️" : nodeKind?.startsWith("agent.") ? "🤖" : "📦";
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: role === "user" ? ACCENT.indigo : SURFACE.panel,
        border: `1px solid ${BORDER.default}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      {emoji}
    </div>
  );
}

// ─── Node execution step ───────────────────────────────────

function NodeStep({ node }: { node: NodeDebugState }) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(node.status);
  const icon = statusIcon(node.status);
  const isRunning = node.status === "running";

  return (
    <div
      style={{
        display: "flex",
        gap: SPACING.sm,
        padding: `${SPACING.xs}px 0`,
      }}
    >
      {/* Status indicator */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            background: node.status === "completed" ? color : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            color: node.status === "completed" ? "#fff" : color,
            ...(isRunning ? { animation: "af-spin 1s linear infinite" } : {}),
          }}
        >
          {icon}
        </div>
        {/* Connector line */}
        <div style={{ width: 1, flex: 1, background: BORDER.default, minHeight: 8 }} />
      </div>

      {/* Node content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: SPACING.xs }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.xs,
            cursor: "pointer",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize, fontWeight: 500 }}>
            {node.label}
          </span>
          <span style={{ color, fontSize: TYPO.smallFontSize }}>
            {node.status}
          </span>
          {node.agentId && (
            <span style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
              · {node.agentId}
            </span>
          )}
        </div>

        {/* Running: show streaming output inline */}
        {isRunning && node.streamingText && (
          <div
            style={{
              marginTop: SPACING.xs,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: SURFACE.editor,
              borderRadius: 4,
              border: `1px solid ${BORDER.default}`,
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {truncate(node.streamingText, 500)}
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 10,
                background: ACCENT.alertAmber,
                borderRadius: 1,
                marginLeft: 2,
                animation: "af-blink 0.6s ease-in-out infinite",
                verticalAlign: "text-bottom",
              }}
            />
          </div>
        )}
        {isRunning && !node.streamingText && node.reasoningText && (
          <div
            style={{
              marginTop: SPACING.xs,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: SURFACE.editor,
              borderRadius: 4,
              border: `1px solid ${BORDER.default}`,
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {truncate(node.reasoningText, 500)}
          </div>
        )}

        {/* Completed: show final text */}
        {node.status === "completed" && node.finalText && !expanded && (
          <div
            style={{
              marginTop: SPACING.xs,
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              whiteSpace: "pre-wrap",
              cursor: "pointer",
            }}
            onClick={() => setExpanded(!expanded)}
          >
            {truncate(node.finalText, 150)}
          </div>
        )}

        {/* Failed: show error */}
        {node.status === "failed" && node.lastEvent && (
          <div
            style={{
              marginTop: SPACING.xs,
              color: ACCENT.errorRed,
              fontSize: TYPO.smallFontSize,
            }}
          >
            {node.lastEvent}
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div style={{ display: "grid", gap: SPACING.xs, marginTop: SPACING.xs }}>
            {node.finalText && renderDisclosure("Output", node.finalText, `${node.nodeId}:output`, true)}
            {node.reasoningText && renderDisclosure("Thinking", node.reasoningText, `${node.nodeId}:thinking`)}
            {Object.keys(node.inputs).length > 0 && renderDisclosure("Inputs", formatValue(node.inputs), `${node.nodeId}:inputs`)}
            {Object.keys(node.portOutputs).length > 0 && renderDisclosure("Port Outputs", formatValue(node.portOutputs), `${node.nodeId}:ports`)}
            {node.structuredOutput && renderDisclosure("Structured Output", formatValue(node.structuredOutput), `${node.nodeId}:structured`)}
            {node.toolCalls && node.toolCalls.length > 0 && renderDisclosure(
              "Tool Calls",
              node.toolCalls.map((tc: ToolCallSummary) => `${tc.toolName} · ${tc.status}`).join("\n"),
              `${node.nodeId}:tools`,
            )}
            {node.promptSources.length > 0 && renderDisclosure("Prompt Sources", formatPromptSources(node.promptSources), `${node.nodeId}:prompts`)}
            {node.warnings && node.warnings.length > 0 && renderDisclosure("Warnings", node.warnings.join("\n"), `${node.nodeId}:warnings`)}
            {node.usage && formatUsage(node.usage) && (
              <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, paddingLeft: SPACING.sm }}>
                Usage · {formatUsage(node.usage)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat message bubble ───────────────────────────────────

function ChatMessage({ entry }: { entry: RunTimelineEntry }) {
  const isSystem = entry.role === "system";
  const isStreaming = entry.status === "running" && entry.role === "assistant";
  // Use streamingText as the visible content when streaming, otherwise entry.content
  const displayContent = isStreaming && entry.streamingText
    ? entry.streamingText
    : entry.content;

  const [toolCallExpanded, setToolCallExpanded] = useState<number | null>(null);

  return (
    <div
      style={{
        display: "flex",
        gap: SPACING.sm,
        padding: `${SPACING.sm}px ${SPACING.md}px`,
      }}
    >
      <Avatar role={entry.role} nodeKind={entry.nodeKind} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header line */}
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.xs, marginBottom: 2 }}>
          <span style={{ color: TEXT.primary, fontSize: TYPO.smallFontSize, fontWeight: 600 }}>
            {entry.title}
          </span>
          {entry.agentId && (
            <span style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
              · {entry.agentId}
            </span>
          )}
          {isStreaming && (
            <span
              style={{
                color: ACCENT.alertAmber,
                fontSize: TYPO.smallFontSize,
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ animation: "af-spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              streaming…
            </span>
          )}
          {!isStreaming && entry.status && (
            <span style={{
              fontSize: 11,
              padding: "1px 5px",
              borderRadius: 4,
              fontWeight: 600,
              background: entry.status === "failed" ? "rgba(248, 113, 113, 0.15)"
                : entry.status === "completed" ? "rgba(52, 211, 153, 0.15)"
                : "rgba(96, 165, 250, 0.15)",
              color: entry.status === "failed" ? "#f87171"
                : entry.status === "completed" ? "#34d399"
                : "#60a5fa",
            }}>
              {entry.status}
            </span>
          )}
          {entry.durationMs !== undefined && !isStreaming ? (
            <span style={{
              fontSize: 11,
              padding: "1px 5px",
              borderRadius: 4,
              background: "rgba(96, 165, 250, 0.1)",
              color: "#60a5fa",
            }}>
              {entry.durationMs >= 1000
                ? `${(entry.durationMs / 1000).toFixed(1)}s`
                : `${entry.durationMs}ms`}
            </span>
          ) : null}
          <span style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, marginLeft: "auto" }}>
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Error Trace — compact inline for failed entries */}
        {entry.errorTrace && entry.status === "failed" ? (
          <div
            style={{
              marginTop: 2,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: "rgba(248, 113, 113, 0.08)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              borderRadius: 4,
              display: "grid",
              gap: 2,
            }}
          >
            <div style={{ color: "#f87171", fontSize: TYPO.smallFontSize, fontWeight: 600 }}>
              ❌ {entry.errorTrace.code}: {entry.errorTrace.message}
            </div>
            {entry.errorTrace.category ? (
              <div style={{ color: TEXT.muted, fontSize: 11 }}>Category: {entry.errorTrace.category}</div>
            ) : null}
            {entry.errorTrace.stack ? (
              <details style={{ marginTop: 2 }}>
                <summary style={{ cursor: "pointer", color: TEXT.muted, fontSize: 11 }}>Stack trace</summary>
                <pre style={{
                  margin: 0,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  color: TEXT.muted,
                  whiteSpace: "pre-wrap",
                  maxHeight: 150,
                  overflow: "auto",
                }}>
                  {entry.errorTrace.stack}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {/* Content */}
        <div
          style={{
            color: isSystem ? ACCENT.errorRed : TEXT.primary,
            fontSize: TYPO.fontSize,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {displayContent}
          {isStreaming && displayContent.length > 0 && (
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 14,
                background: ACCENT.alertAmber,
                borderRadius: 1,
                marginLeft: 2,
                animation: "af-blink 0.6s ease-in-out infinite",
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </div>

        {/* Streaming reasoning inline */}
        {isStreaming && entry.streamingReasoningText && (
          <div
            style={{
              marginTop: SPACING.xs,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: SURFACE.editor,
              borderRadius: 4,
              border: `1px solid ${BORDER.default}`,
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            💭 {truncate(entry.streamingReasoningText, 1000)}
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 10,
                background: ACCENT.alertAmber,
                borderRadius: 1,
                marginLeft: 2,
                animation: "af-blink 0.6s ease-in-out infinite",
                verticalAlign: "text-bottom",
              }}
            />
          </div>
        )}

        {/* Reasoning / thinking inline (completed) */}
        {!isStreaming && entry.reasoningText && (
          <div
            style={{
              marginTop: SPACING.xs,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: SURFACE.editor,
              borderRadius: 4,
              border: `1px solid ${BORDER.default}`,
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            💭 {truncate(entry.reasoningText, 1000)}
          </div>
        )}

        {/* Tool calls — compact expandable cards */}
        {entry.toolCalls && entry.toolCalls.length > 0 && (
          <div style={{ marginTop: SPACING.xs, display: "grid", gap: SPACING.xs }}>
            {entry.toolCalls.map((tc: ToolCallSummary, i: number) => (
              <div
                key={i}
                style={{
                  background: SURFACE.editor,
                  border: `1px solid ${BORDER.default}`,
                  borderRadius: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => setToolCallExpanded((prev) => prev === i ? null : i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.xs,
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    background: "transparent",
                    border: "none",
                    color: TEXT.secondary,
                    cursor: "pointer",
                    fontSize: TYPO.smallFontSize,
                    fontWeight: 500,
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <span>🔧</span>
                  <span>{tc.toolName}</span>
                  <span style={{
                    marginLeft: 4,
                    fontSize: 10,
                    padding: "0px 4px",
                    borderRadius: 3,
                    background: tc.status === "success" ? "rgba(52, 211, 153, 0.15)" : tc.status === "failed" ? "rgba(248, 113, 113, 0.15)" : "rgba(96, 165, 250, 0.15)",
                    color: tc.status === "success" ? "#34d399" : tc.status === "failed" ? "#f87171" : "#60a5fa",
                  }}>
                    {tc.status === "pending_approval" ? "⏳ approval" : tc.status}
                  </span>
                  {tc.durationMs !== undefined ? (
                    <span style={{ fontSize: 10, color: TEXT.muted }}>
                      {tc.durationMs >= 1000 ? `${(tc.durationMs / 1000).toFixed(1)}s` : `${tc.durationMs}ms`}
                    </span>
                  ) : null}
                  <span style={{ marginLeft: "auto", color: TEXT.muted, fontSize: 10 }}>
                    {toolCallExpanded === i ? "▼" : "▶"}
                  </span>
                </button>
                {toolCallExpanded === i ? (
                  <div style={{ padding: `${SPACING.xs}px ${SPACING.sm}px`, borderTop: `1px solid ${BORDER.default}`, display: "grid", gap: 4 }}>
                    <div>
                      <span style={{ fontSize: 10, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>ID</span>
                      <span style={{ fontSize: 11, color: TEXT.secondary, marginLeft: SPACING.xs, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {tc.toolCallId}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</span>
                      <span style={{ fontSize: 11, color: TEXT.secondary, marginLeft: SPACING.xs, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {tc.toolName}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</span>
                      <span style={{ fontSize: 11, color: tc.status === "success" ? "#34d399" : tc.status === "failed" ? "#f87171" : "#60a5fa", marginLeft: SPACING.xs }}>
                        {tc.status}
                      </span>
                    </div>
                    {tc.durationMs !== undefined ? (
                      <div>
                        <span style={{ fontSize: 10, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</span>
                        <span style={{ fontSize: 11, color: TEXT.secondary, marginLeft: SPACING.xs }}>
                          {tc.durationMs >= 1000 ? `${(tc.durationMs / 1000).toFixed(1)}s` : `${tc.durationMs}ms`}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Usage — compact format */}
        {entry.usage && formatUsage(entry.usage) && (
          <div style={{ color: TEXT.muted, fontSize: 11, marginTop: SPACING.xs, display: "flex", gap: SPACING.sm }}>
            {entry.usage.inputTokens !== undefined ? <span>↑{entry.usage.inputTokens}</span> : null}
            {entry.usage.outputTokens !== undefined ? <span>↓{entry.usage.outputTokens}</span> : null}
            {entry.usage.totalTokens !== undefined ? <span>∑{entry.usage.totalTokens}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Flow selector dropdown ────────────────────────────────

function FlowSelector({
  flowList,
  activeFlowPath,
  onSelect,
}: {
  flowList: readonly { flowPath: string; name: string; nodeCount: number }[];
  activeFlowPath: string | null;
  onSelect: (flowPath: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeFlow = flowList.find((f) => f.flowPath === activeFlowPath);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.xs,
          padding: `${SPACING.xs}px ${SPACING.sm}px`,
          background: "transparent",
          border: `1px solid ${BORDER.default}`,
          borderRadius: 4,
          color: TEXT.primary,
          fontSize: TYPO.smallFontSize,
          cursor: "pointer",
          maxWidth: "100%",
          outline: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeFlow ? activeFlow.name : "Select flow…"}
        </span>
        <span style={{ color: TEXT.muted, fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            marginTop: 2,
            background: SURFACE.sidebar,
            border: `1px solid ${BORDER.default}`,
            borderRadius: 4,
            maxHeight: 200,
            overflow: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {flowList.length === 0 ? (
            <div style={{ padding: SPACING.sm, color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
              No flows available
            </div>
          ) : (
            flowList.map((f) => (
              <div
                key={f.flowPath}
                onClick={() => {
                  onSelect(f.flowPath);
                  setOpen(false);
                }}
                style={{
                  padding: `${SPACING.xs}px ${SPACING.sm}px`,
                  cursor: "pointer",
                  background: f.flowPath === activeFlowPath ? SURFACE.hover : "transparent",
                  color: f.flowPath === activeFlowPath ? TEXT.primary : TEXT.secondary,
                  fontSize: TYPO.smallFontSize,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => {
                  if (f.flowPath !== activeFlowPath) {
                    (e.currentTarget as HTMLDivElement).style.background = SURFACE.hover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (f.flowPath !== activeFlowPath) {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }
                }}
              >
                <span>{f.name}</span>
                <span style={{ color: TEXT.muted }}>{f.nodeCount} nodes</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Session types ──────────────────────────────────────

interface SessionMeta {
  readonly runId: string;
  readonly flowPath: string;
  readonly flowName: string;
  readonly state: string;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly hasHistory: boolean;
}

// ─── Session persistence hook ──────────────────────────────

function useSessionPersistence(run: LocalRunRecord | null) {
  const platform = usePlatform();
  const rootPath = useWorkspaceTreeStore((s) => s.rootPath);
  const savedRunId = useRef<string | null>(null);

  useEffect(() => {
    if (!run || !rootPath) return;
    // Only save when run is completed or failed, and we haven't saved this runId yet
    if ((run.state !== "completed" && run.state !== "failed") || savedRunId.current === run.runId) return;

    savedRunId.current = run.runId;

    const sessionDir = `${rootPath}/.agents-flow/memory/${run.runId}`;
    const sessionData = {
      runId: run.runId,
      flowPath: run.flowPath,
      flowName: run.flowName,
      state: run.state,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      input: run.input,
      timeline: run.timeline.map((entry) => ({
        entryId: entry.entryId,
        role: entry.role,
        title: entry.title,
        content: entry.content,
        timestamp: entry.timestamp,
        nodeId: entry.nodeId,
        nodeKind: entry.nodeKind,
        agentId: entry.agentId,
        status: entry.status,
      })),
      nodeStates: [...run.nodeStates.values()].map((ns) => ({
        nodeId: ns.nodeId,
        label: ns.label,
        nodeKind: ns.nodeKind,
        agentId: ns.agentId,
        status: ns.status,
        finalText: ns.finalText,
      })),
      finalResult: run.finalResult,
      error: run.error,
    };

    // Fire-and-forget: write session to disk
    platform.workspace.createFile(
      `${sessionDir}/session.json`,
      JSON.stringify(sessionData, null, 2),
    ).catch(() => {
      // Session persistence is best-effort; don't block UI on failure
    });
  }, [run, rootPath, platform]);
}

// ─── Session history loader hook ───────────────────────────

function useSessionHistory(flowPath: string | null) {
  const platform = usePlatform();
  const rootPath = useWorkspaceTreeStore((s) => s.rootPath);
  const [sessions, setSessions] = useState<readonly SessionMeta[]>([]);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [loadedTimeline, setLoadedTimeline] = useState<readonly RunTimelineEntry[]>([]);

  // Refresh session list when flowPath changes
  useEffect(() => {
    // Always reset history state when the flow changes
    setLoadedTimeline([]);
    setLoadedSessionId(null);

    if (!flowPath || !rootPath) {
      setSessions([]);
      return;
    }

    const memoryDir = `${rootPath}/.agents-flow/memory`;

    platform.workspace.readDir(memoryDir).then((entries) => {
      const sessionPromises = entries
        .filter((entry) => entry.isDirectory)
        .map((entry) => {
          const sessionFilePath = `${memoryDir}/${entry.name}/session.json`;
          return platform.workspace.readFile(sessionFilePath).then((fileContent) => {
            if (!fileContent) return null;
            try {
              const data = JSON.parse(fileContent.content) as {
                runId: string;
                flowPath: string;
                flowName: string;
                state: string;
                startedAt: number;
                completedAt?: number;
              };
              // Only include sessions for the current flow
              if (data.flowPath === flowPath) {
                return {
                  runId: data.runId,
                  flowPath: data.flowPath,
                  flowName: data.flowName,
                  state: data.state,
                  startedAt: data.startedAt,
                  completedAt: data.completedAt,
                  hasHistory: true,
                } as SessionMeta;
              }
              return null;
            } catch {
              return null;
            }
          }).catch(() => null);
        });

      Promise.all(sessionPromises).then((results) => {
        const valid = results
          .filter((r): r is SessionMeta => r !== null)
          .sort((a, b) => b.startedAt - a.startedAt); // Most recent first
        setSessions(valid);
      });
    }).catch(() => {
      // Memory directory may not exist yet — that's fine
      setSessions([]);
    });
  }, [flowPath, rootPath, platform]);

  // Load a session's timeline for display
  const loadSession = useCallback((sessionId: string) => {
    if (!rootPath) return;
    const sessionFilePath = `${rootPath}/.agents-flow/memory/${sessionId}/session.json`;

    platform.workspace.readFile(sessionFilePath).then((fileContent) => {
      if (!fileContent) return;
      try {
        const data = JSON.parse(fileContent.content) as {
          timeline: Array<{
            entryId: string;
            role: "user" | "assistant" | "system";
            title: string;
            content: string;
            timestamp: number;
            nodeId?: string;
            nodeKind?: string;
            agentId?: string;
            status?: "completed" | "failed" | "running";
          }>;
        };
        setLoadedTimeline(data.timeline.map((entry): RunTimelineEntry => ({
          entryId: entry.entryId,
          role: entry.role,
          title: entry.title,
          content: entry.content,
          timestamp: entry.timestamp,
          ...(entry.nodeId !== undefined ? { nodeId: entry.nodeId } : {}),
          ...(entry.nodeKind !== undefined ? { nodeKind: entry.nodeKind } : {}),
          ...(entry.agentId !== undefined ? { agentId: entry.agentId } : {}),
          ...(entry.status !== undefined ? { status: entry.status } : {}),
        })));
        setLoadedSessionId(sessionId);
      } catch {
        // Ignore parse errors
      }
    }).catch(() => {
      // File may not exist
    });
  }, [rootPath, platform]);

  const clearLoadedSession = useCallback(() => {
    setLoadedSessionId(null);
    setLoadedTimeline([]);
  }, []);

  return { sessions, loadedSessionId, loadedTimeline, loadSession, clearLoadedSession };
}

// ─── Main panel ────────────────────────────────────────────

const VIEW_MODES: ReadonlyArray<{ id: RightViewId; label: string; icon: string }> = [
  { id: "assistant", label: "Chat", icon: "💬" },
  { id: "run-detail", label: "Nodes", icon: "📋" },
];

export function AssistantPanel() {
  const activeRightView = useWorkbenchStore((s) => s.activeRightView);
  const setActiveRightView = useWorkbenchStore((s) => s.setActiveRightView);
  const assistantTabBtn = useButtonHover();
  const runDetailTabBtn = useButtonHover();
  const tabHoverMap = {
    assistant: assistantTabBtn,
    "run-detail": runDetailTabBtn,
  } as const;

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.assistant,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Spinning animation for running nodes */}
      <style>{`
        @keyframes af-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes af-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        {VIEW_MODES.map((mode) => {
          const isActive = activeRightView === mode.id;
          const { hoverBg, hoverProps, isHovered, buttonStyle } = tabHoverMap[mode.id];
          const bg = isActive
            ? (isHovered ? BUTTON.activeBg : SURFACE.sidebar)
            : hoverBg;
          return (
            <button
              key={mode.id}
              onClick={() => setActiveRightView(mode.id)}
              style={{
                ...buttonStyle,
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                background: bg,
                borderBottom:
                  activeRightView === mode.id
                    ? `2px solid ${BORDER.active}`
                    : "2px solid transparent",
                color: activeRightView === mode.id ? TEXT.primary : buttonStyle.color,
                fontSize: TYPO.smallFontSize,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: SPACING.xs,
              }}
              {...hoverProps}
            >
              <span>{mode.icon}</span>
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      {activeRightView === "assistant" ? <AssistantChat /> : <RunDetail />}
    </div>
  );
}

// ─── Assistant Chat view ───────────────────────────────────

function AssistantChat() {
  const platform = usePlatform();
  const activeFlowPath = useWorkspaceStore((state) => state.activeFlowPath);
  const setActiveFlow = useWorkspaceStore((state) => state.setActiveFlow);
  const openFlow = useWorkspaceStore((state) => state.openFlow);
  const documents = useWorkspaceStore((state) => state.documents);
  const flowList = useWorkspaceStore((state) => state.flowList);
  const promptAssetManifest = useWorkspaceStore((state) => state.promptAssetManifest);
  const startFlow = useRuntimeStore((state) => state.startFlow);

  // Get the run for the selected flow
  const selectedFlowPath = activeFlowPath;
  const latestRun = useRuntimeStore((state) =>
    selectedFlowPath ? state.runsByFlowPath.get(selectedFlowPath) ?? null : null,
  );

  // Session persistence
  useSessionPersistence(latestRun);

  // Session history
  const { sessions, loadedSessionId, loadedTimeline, loadSession, clearLoadedSession } =
    useSessionHistory(selectedFlowPath);

  const [userPrompt, setUserPrompt] = useState("");
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionPickerRef = useRef<HTMLDivElement>(null);

  const sendBtn = usePrimaryButtonHover();
  const doc = selectedFlowPath ? documents.get(selectedFlowPath) ?? null : null;

  // Close session picker on click outside
  useEffect(() => {
    if (!sessionPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sessionPickerRef.current && !sessionPickerRef.current.contains(e.target as globalThis.Node)) {
        setSessionPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sessionPickerOpen]);

  // Auto-scroll to bottom on new messages or streaming content updates
  const streamingSignature = latestRun?.timeline
    .filter((e) => e.status === "running" && e.streamingText)
    .map((e) => `${e.entryId}:${e.streamingText?.length ?? 0}`)
    .join("|");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [latestRun?.timeline.length, streamingSignature, loadedTimeline.length]);

  const handleSend = useCallback(async () => {
    if (!selectedFlowPath || !doc?.flow || userPrompt.trim().length === 0) return;
    // When sending a new prompt, clear any loaded historical session
    clearLoadedSession();
    try {
      await startFlow(selectedFlowPath, doc.flow, { userPrompt }, promptAssetManifest);
      setUserPrompt("");
    } catch {
      // Runtime store will record the failure state
    }
  }, [selectedFlowPath, doc?.flow, startFlow, userPrompt, promptAssetManifest, clearLoadedSession]);

  const handleFlowSelect = useCallback(async (flowPath: string | null) => {
    if (!flowPath) return;
    // If flow is not already open, load it via platform API then open it
    if (!documents.has(flowPath)) {
      try {
        const yamlSource = await platform.flow.load(flowPath);
        openFlow(flowPath, yamlSource);
      } catch {
        // If loading fails, just activate — the empty state will show
        setActiveFlow(flowPath);
        return;
      }
    } else {
      // Already open — just activate the tab
      setActiveFlow(flowPath);
    }
  }, [documents, platform.flow, openFlow, setActiveFlow]);

  const handleNewSession = useCallback(() => {
    clearLoadedSession();
    if (selectedFlowPath) {
      useRuntimeStore.getState().clearRun(selectedFlowPath);
    }
    setSessionPickerOpen(false);
  }, [clearLoadedSession, selectedFlowPath]);

  const isRunning = latestRun?.state === "running";
  const isViewingHistory = loadedSessionId !== null;
  // Show loaded history timeline if viewing a historical session, else show live
  const messages = isViewingHistory ? loadedTimeline : (latestRun?.timeline ?? []);

  return (
    <>
      {/* Flow selector + session management bar */}
      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
        }}
      >
        <FlowSelector
          flowList={flowList}
          activeFlowPath={selectedFlowPath}
          onSelect={handleFlowSelect}
        />
        {latestRun && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.xs,
              color: statusColor(latestRun.state),
              fontSize: TYPO.smallFontSize,
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor(latestRun.state),
              ...(isRunning ? { animation: "af-spin 1s linear infinite" } : {}),
            }} />
            {runStateLabel(latestRun.state)}
          </div>
        )}
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        {/* Session management buttons */}
        <button
          type="button"
          onClick={handleNewSession}
          title="New session"
          style={{
            background: "transparent",
            border: `1px solid ${BORDER.default}`,
            borderRadius: 4,
            color: TEXT.secondary,
            fontSize: 14,
            cursor: "pointer",
            padding: `1px 6px`,
            lineHeight: 1,
          }}
        >
          +
        </button>
        <div ref={sessionPickerRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setSessionPickerOpen(!sessionPickerOpen)}
            title="Session history"
            style={{
              background: "transparent",
              border: `1px solid ${BORDER.default}`,
              borderRadius: 4,
              color: TEXT.secondary,
              fontSize: 14,
              cursor: "pointer",
              padding: `1px 6px`,
              lineHeight: 1,
            }}
          >
            ☰
          </button>
          {sessionPickerOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                zIndex: 200,
                marginTop: 2,
                background: SURFACE.sidebar,
                border: `1px solid ${BORDER.default}`,
                borderRadius: 4,
                minWidth: 220,
                maxHeight: 300,
                overflow: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              {sessions.length === 0 ? (
                <div style={{ padding: SPACING.sm, color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
                  No session history
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.runId}
                    onClick={() => {
                      loadSession(session.runId);
                      setSessionPickerOpen(false);
                    }}
                    style={{
                      padding: `${SPACING.xs}px ${SPACING.sm}px`,
                      cursor: "pointer",
                      background: loadedSessionId === session.runId ? SURFACE.hover : "transparent",
                      color: loadedSessionId === session.runId ? TEXT.primary : TEXT.secondary,
                      fontSize: TYPO.smallFontSize,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => {
                      if (loadedSessionId !== session.runId) {
                        (e.currentTarget as HTMLDivElement).style.background = SURFACE.hover;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (loadedSessionId !== session.runId) {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }
                    }}
                  >
                    <span>
                      {session.runId.slice(0, 8)} · {new Date(session.startedAt).toLocaleString()}
                    </span>
                    <span style={{ color: statusColor(session.state === "completed" ? "completed" : session.state === "failed" ? "failed" : "idle") }}>
                      {session.state}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* History indicator */}
      {isViewingHistory && (
        <div
          style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`,
            background: SURFACE.panel,
            borderBottom: `1px solid ${BORDER.default}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT.alertAmber, fontSize: TYPO.smallFontSize }}>
            📋 Viewing session history: {loadedSessionId?.slice(0, 8)}
          </span>
          <button
            type="button"
            onClick={clearLoadedSession}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT.secondary,
              fontSize: TYPO.smallFontSize,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Back to live
          </button>
        </div>
      )}

      {/* Message body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!selectedFlowPath || !doc?.flow ? (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: SPACING.xl,
            color: TEXT.muted,
            fontSize: TYPO.fontSize,
            textAlign: "center",
          }}>
            <div>
              <div style={{ fontSize: 32, marginBottom: SPACING.md }}>💬</div>
              <div>Select a flow above and send a task to start.</div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: SPACING.xl,
            color: TEXT.muted,
            fontSize: TYPO.fontSize,
            textAlign: "center",
          }}>
            <div>
              <div style={{ fontSize: 32, marginBottom: SPACING.md }}>🤖</div>
              <div>Send a task below to start the flow.</div>
              <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, marginTop: SPACING.xs }}>
                {doc.flow.meta.name} · {doc.flow.graph.nodes.length} nodes
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {messages.map((entry) => (
              <ChatMessage key={entry.entryId} entry={entry} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: SPACING.sm,
          borderTop: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        <textarea
          placeholder={doc?.flow ? "Describe the task for the current flow…" : "Select a flow first…"}
          value={userPrompt}
          onChange={(event) => setUserPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Ignore Enter during IME composition (e.g. CJK input methods)
            // nativeEvent.isComposing covers the keydown phase reliably.
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey && !isRunning && userPrompt.trim().length > 0) {
              event.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            background: SURFACE.sidebar,
            border: `1px solid ${BORDER.default}`,
            borderRadius: 6,
            color: TEXT.primary,
            fontSize: TYPO.fontSize,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            outline: "none",
            lineHeight: 1.4,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: SPACING.xs }}>
          <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
            {isRunning ? "Flow is running…" : "Shift+Enter for new line"}
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!doc?.flow || isRunning || userPrompt.trim().length === 0}
            style={{
              ...sendBtn.buttonStyle,
              background: doc?.flow && !isRunning ? sendBtn.hoverBg : TEXT.muted,
              color: BUTTON.primaryText,
              padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
              fontSize: TYPO.smallFontSize,
              cursor: doc?.flow && !isRunning ? "pointer" : "not-allowed",
              borderRadius: BUTTON.borderRadius,
            }}
            {...sendBtn.hoverProps}
          >
            {isRunning ? "⟳ Running…" : "▶ Send"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Run Detail (Node Execution Monitor) view ──────────────

function RunDetail() {
  const activeFlowPath = useWorkspaceStore((state) => state.activeFlowPath);
  const latestRun = useRuntimeStore((state) =>
    activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) ?? null : null,
  );

  // Session persistence
  useSessionPersistence(latestRun);

  if (!latestRun) {
    return (
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
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: SPACING.md }}>📋</div>
          <div>No active run. Start a flow to see node execution progress.</div>
        </div>
      </div>
    );
  }

  const nodeStates = [...latestRun.nodeStates.values()];

  // Split into completed/running and pending nodes
  const activeNodes = nodeStates.filter((n) => n.status !== "idle");
  const pendingNodes = nodeStates.filter((n) => n.status === "idle");

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: SPACING.md,
      }}
    >
      {/* Run summary */}
      <div
        style={{
          padding: SPACING.sm,
          borderRadius: 6,
          background: SURFACE.sidebar,
          border: `1px solid ${BORDER.default}`,
          marginBottom: SPACING.md,
          display: "grid",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
          <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize, fontWeight: 600 }}>
            {latestRun.flowName}
          </span>
          <span
            style={{
              padding: `1px ${SPACING.xs}px`,
              borderRadius: 3,
              background: statusColor(latestRun.state),
              color: "#fff",
              fontSize: TYPO.smallFontSize,
              fontWeight: 600,
            }}
          >
            {runStateLabel(latestRun.state)}
          </span>
        </div>
        <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
          {latestRun.runId.slice(0, 8)} · {new Date(latestRun.startedAt).toLocaleTimeString()}
          {latestRun.completedAt ? ` → ${new Date(latestRun.completedAt).toLocaleTimeString()}` : ""}
        </div>
      </div>

      {/* Active / completed nodes — vertical timeline */}
      {activeNodes.length > 0 && (
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize, fontWeight: 600, marginBottom: SPACING.xs }}>
            Execution Progress
          </div>
          {activeNodes.map((node) => (
            <NodeStep key={node.nodeId} node={node} />
          ))}
        </div>
      )}

      {/* Pending nodes */}
      {pendingNodes.length > 0 && (
        <div>
          <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, fontWeight: 600, marginBottom: SPACING.xs }}>
            Pending ({pendingNodes.length})
          </div>
          {pendingNodes.map((node) => (
            <div
              key={node.nodeId}
              style={{
                padding: `${SPACING.xs}px ${SPACING.sm}px`,
                color: TEXT.muted,
                fontSize: TYPO.smallFontSize,
                display: "flex",
                alignItems: "center",
                gap: SPACING.xs,
              }}
            >
              <span style={{ color: statusColor("idle") }}>○</span>
              {node.label}
              <span style={{ color: TEXT.muted }}>· {node.nodeKind}</span>
            </div>
          ))}
        </div>
      )}

      {/* Raw events disclosure */}
      <details
        style={{
          border: `1px solid ${BORDER.default}`,
          borderRadius: 6,
          background: SURFACE.sidebar,
          marginTop: SPACING.md,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            color: TEXT.secondary,
            fontSize: TYPO.smallFontSize,
            userSelect: "none",
          }}
        >
          Raw Events ({latestRun.events.length})
        </summary>
        <div
          style={{
            padding: `0 ${SPACING.md}px ${SPACING.md}px`,
            color: TEXT.muted,
            fontSize: TYPO.smallFontSize,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            whiteSpace: "pre-wrap",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {latestRun.events.map((event) =>
            JSON.stringify({ eventType: event.eventType, nodeId: event.nodeId, payload: event.payload }, null, 2),
          ).join("\n\n")}
        </div>
      </details>
    </div>
  );
}