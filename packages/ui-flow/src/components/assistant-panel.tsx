import { useCallback, useState, type JSX } from "react";
import type { AgentTurnUsage } from "@agentsflow/agent-contracts";
import { useWorkbenchStore, type RightViewId } from "../store/workbench-store.js";
import { useRuntimeStore, type PromptSourceRef, type RunTimelineEntry } from "../store/runtime-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";
import { useButtonHover, usePrimaryButtonHover } from "./use-button-hover.js";

/**
 * AssistantPanel — copilot-like chat panel on the right sidebar.
 *
 * This is a UI shell only: it renders a header, message area, and input.
 * The actual chat backend is out of scope — this component defines the
 * state protocol and view modes.
 *
 * Layout invariant: fills the right sidebar panel.
 * Must NOT set width — the sidebar panel controls that.
 */

const VIEW_MODES: ReadonlyArray<{ id: RightViewId; label: string }> = [
  { id: "assistant", label: "Assistant" },
  { id: "run-detail", label: "Run Detail" },
];

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
  if (!usage) {
    return null;
  }

  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`in ${usage.inputTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`out ${usage.outputTokens}`);
  if (usage.totalTokens !== undefined) parts.push(`total ${usage.totalTokens}`);
  if (usage.durationMs !== undefined) parts.push(`${usage.durationMs}ms`);
  if (usage.steps !== undefined) parts.push(`${usage.steps} steps`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function renderDisclosure(title: string, content: string, key: string): JSX.Element {
  return (
    <details
      key={key}
      style={{
        border: `1px solid ${BORDER.default}`,
        borderRadius: 6,
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
        }}
      >
        {content}
      </div>
    </details>
  );
}

function formatPromptSources(promptSources: readonly PromptSourceRef[]): string {
  return promptSources
    .map((source) => {
      const value = source.value ? `\n${source.value}` : "";
      return `[${source.scope}] ${source.label}${value}`;
    })
    .join("\n\n");
}

function renderTimelineEntry(entry: RunTimelineEntry): JSX.Element {
  const isUser = entry.role === "user";
  const isSystem = entry.role === "system";
  const usage = formatUsage(entry.usage);
  const files = entry.artifacts?.filter((artifact) => artifact.path).map((artifact) => artifact.path!) ?? [];
  const thinkingContent = entry.reasoningText
    ?? (entry.structuredOutput ? formatValue(entry.structuredOutput) : undefined);

  return (
    <div
      key={entry.entryId}
      style={{
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        borderRadius: 10,
        background: isUser
          ? `${ACCENT.indigo}22`
          : isSystem
            ? SURFACE.editor
            : SURFACE.sidebar,
        border: `1px solid ${BORDER.default}`,
        display: "grid",
        gap: SPACING.xs,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm }}>
        <div style={{ color: TEXT.primary, fontSize: TYPO.smallFontSize, fontWeight: 600 }}>
          {entry.title}
          {entry.agentId ? ` · ${entry.agentId}` : ""}
        </div>
        <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>
          {new Date(entry.timestamp).toLocaleTimeString()}
          {entry.status ? ` · ${entry.status}` : ""}
        </div>
      </div>

      {entry.nodeKind ? (
        <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>{entry.nodeKind}</div>
      ) : null}

      <div style={{ color: TEXT.primary, fontSize: TYPO.fontSize, whiteSpace: "pre-wrap" }}>{entry.content}</div>

      {usage ? (
        <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>Usage · {usage}</div>
      ) : null}

      <div style={{ display: "grid", gap: SPACING.xs }}>
        {thinkingContent ? renderDisclosure("Thinking / Structured Output", thinkingContent, `${entry.entryId}:thinking`) : null}
        {entry.inputs && Object.keys(entry.inputs).length > 0
          ? renderDisclosure("Inputs", formatValue(entry.inputs), `${entry.entryId}:inputs`)
          : null}
        {entry.promptSources && entry.promptSources.length > 0
          ? renderDisclosure("Prompt Sources", formatPromptSources(entry.promptSources), `${entry.entryId}:prompts`)
          : null}
        {entry.toolCalls && entry.toolCalls.length > 0
          ? renderDisclosure(
            "Tool Calls",
            entry.toolCalls.map((toolCall) => `${toolCall.toolName} · ${toolCall.status}`).join("\n"),
            `${entry.entryId}:tools`,
          )
          : null}
        {files.length > 0
          ? renderDisclosure("Modified Files", files.join("\n"), `${entry.entryId}:files`)
          : null}
        {entry.warnings && entry.warnings.length > 0
          ? renderDisclosure("Warnings", entry.warnings.join("\n"), `${entry.entryId}:warnings`)
          : null}
      </div>
    </div>
  );
}

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
      {/* View mode tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        {VIEW_MODES.map((mode) => {
          const isActive = activeRightView === mode.id;
          const { hoverBg, hoverProps, isHovered, buttonStyle } = tabHoverMap[mode.id];
          // Four-state background: active+hovered → BUTTON.activeBg, active+not-hovered → SURFACE.sidebar,
          // inactive+hovered → BUTTON.hoverBg, inactive+not-hovered → transparent
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
              }}
              {...hoverProps}
            >
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

function AssistantChat() {
  const activeFlowPath = useWorkspaceStore((state) => state.activeFlowPath);
  const documents = useWorkspaceStore((state) => state.documents);
  const startFlow = useRuntimeStore((state) => state.startFlow);
  const latestRun = useRuntimeStore((state) => (activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) ?? null : null));
  const [userPrompt, setUserPrompt] = useState("请根据当前 flow 完成任务。");

  const sendBtn = usePrimaryButtonHover();
  const doc = activeFlowPath ? documents.get(activeFlowPath) ?? null : null;

  const handleSend = useCallback(async () => {
    if (!activeFlowPath || !doc?.flow || userPrompt.trim().length === 0) {
      return;
    }
    try {
      await startFlow(activeFlowPath, doc.flow, { userPrompt });
    } catch {
      // Runtime store will record the failure state in the transcript.
    }
  }, [activeFlowPath, doc?.flow, startFlow, userPrompt]);

  const messages = latestRun?.timeline ?? [];

  return (
    <>
      {/* Message body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: SPACING.md,
          display: "flex",
          flexDirection: "column",
          gap: SPACING.sm,
        }}
      >
        {!activeFlowPath || !doc?.flow ? (
          <div style={{ color: TEXT.muted, fontSize: TYPO.fontSize }}>
            Open a flow to start a chat-style run transcript.
          </div>
        ) : messages.length === 0 ? (
          <div style={{ color: TEXT.muted, fontSize: TYPO.fontSize }}>
            Send a task below. The chat panel will record dialogue, thinking details, tool calls, and modified files when the run produces them.
          </div>
        ) : (
          messages.map((entry) => renderTimelineEntry(entry))
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
        <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize, marginBottom: SPACING.xs }}>
          {doc?.flow ? `Flow · ${doc.flow.meta.name}` : "No flow selected"}
          {latestRun ? ` · ${latestRun.state}` : ""}
        </div>
        <textarea
          placeholder="Describe the task for the current flow…"
          value={userPrompt}
          onChange={(event) => setUserPrompt(event.currentTarget.value)}
          rows={3}
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
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: SPACING.sm }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={!doc?.flow || latestRun?.state === "running" || userPrompt.trim().length === 0}
            style={{
              ...sendBtn.buttonStyle,
              background: doc?.flow ? sendBtn.hoverBg : TEXT.muted,
              color: BUTTON.primaryText,
              padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
              fontSize: TYPO.smallFontSize,
              cursor: doc?.flow ? "pointer" : "not-allowed",
              marginTop: SPACING.xs,
            }}
            {...sendBtn.hoverProps}
          >
            {latestRun?.state === "running" ? "Running…" : "Send To Flow"}
          </button>
        </div>
      </div>
    </>
  );
}

function RunDetail() {
  const activeFlowPath = useWorkspaceStore((state) => state.activeFlowPath);
  const latestRun = useRuntimeStore((state) => (activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) ?? null : null));

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
        Select a running flow to see details
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: SPACING.md,
        display: "grid",
        gap: SPACING.sm,
      }}
    >
      <div
        style={{
          padding: SPACING.sm,
          borderRadius: 6,
          background: SURFACE.sidebar,
          border: `1px solid ${BORDER.default}`,
          display: "grid",
          gap: 4,
        }}
      >
        <div style={{ color: TEXT.primary, fontSize: TYPO.fontSize, fontWeight: 600 }}>{latestRun.flowName}</div>
        <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>
          {latestRun.runId} · {latestRun.state}
          {latestRun.currentNodeId ? ` · ${latestRun.currentNodeId}` : ""}
        </div>
      </div>

      {[...latestRun.nodeStates.values()].map((node) => (
        <div
          key={node.nodeId}
          style={{
            padding: SPACING.sm,
            borderRadius: 6,
            background: SURFACE.sidebar,
            border: `1px solid ${BORDER.default}`,
            display: "grid",
            gap: 4,
          }}
        >
          <div style={{ color: TEXT.primary, fontSize: TYPO.fontSize, fontWeight: 600 }}>{node.label}</div>
          <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>
            {node.nodeKind}
            {node.agentId ? ` · ${node.agentId}` : ""}
            {` · ${node.status}`}
          </div>
          <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, whiteSpace: "pre-wrap" }}>
            {node.finalText ?? (node.structuredOutput ? formatValue(node.structuredOutput) : "暂无输出")}
          </div>
        </div>
      ))}

      <details
        style={{
          border: `1px solid ${BORDER.default}`,
          borderRadius: 6,
          background: SURFACE.sidebar,
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
          }}
        >
          {latestRun.events.map((event) => JSON.stringify({
            eventType: event.eventType,
            nodeId: event.nodeId,
            payload: event.payload,
          }, null, 2)).join("\n\n")}
        </div>
      </details>
    </div>
  );
}