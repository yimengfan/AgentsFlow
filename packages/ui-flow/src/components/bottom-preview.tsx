import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useState, useCallback } from "react";
import { useRuntimeStore } from "../store/runtime-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";
import { usePrimaryButtonHover, useButtonHover } from "./use-button-hover.js";

/**
 * BottomPreview — run preview panel that appears below the editor.
 *
 * Layout invariant: fills the bottom panel area.
 * Must NOT set height — the panel resize handle controls that.
 */

export function BottomPreview() {
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const documents = useWorkspaceStore((s) => s.documents);
  const toggleBottomPanel = useWorkbenchStore((s) => s.toggleBottomPanel);
  const startFlow = useRuntimeStore((s) => s.startFlow);
  const clearRun = useRuntimeStore((s) => s.clearRun);
  const latestRun = useRuntimeStore((s) => (activeFlowPath ? s.runsByFlowPath.get(activeFlowPath) ?? null : null));

  const doc = activeFlowPath ? documents.get(activeFlowPath) : null;
  const [userPrompt, setUserPrompt] = useState("请根据当前 flow 完成任务。");

  const startBtn = usePrimaryButtonHover();
  const closeBtn = useButtonHover();

  const handleStart = useCallback(async () => {
    if (!activeFlowPath || !doc?.flow) return;
    try {
      await startFlow(activeFlowPath, doc.flow, userPrompt.trim().length > 0 ? { userPrompt } : {});
    } catch {
      // Runtime store records failure state; no local fallback needed here.
    }
  }, [activeFlowPath, doc?.flow, startFlow, userPrompt]);

  const handleClear = useCallback(() => {
    if (!activeFlowPath) {
      return;
    }
    clearRun(activeFlowPath);
  }, [activeFlowPath, clearRun]);

  const eventLines = latestRun?.events.map((event) => JSON.stringify({
    eventType: event.eventType,
    nodeId: event.nodeId,
    payload: event.payload,
  }, null, 2)) ?? [];

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.panel,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: TYPO.smallFontSize, fontWeight: 600, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
          Run Preview
        </span>
        <div style={{ display: "flex", gap: SPACING.xs }}>
          <button
            onClick={handleStart}
            disabled={!doc?.flow || latestRun?.state === "running"}
            style={{
              ...startBtn.buttonStyle,
              background: doc?.flow ? startBtn.hoverBg : TEXT.muted,
              color: BUTTON.primaryText,
              padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
              fontSize: TYPO.smallFontSize,
              cursor: doc?.flow ? "pointer" : "not-allowed",
            }}
            {...startBtn.hoverProps}
          >
            ▶ Start
          </button>
          <button
            onClick={handleClear}
            style={{
              ...closeBtn.buttonStyle,
              background: closeBtn.hoverBg,
              color: TEXT.secondary,
              padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
              fontSize: TYPO.smallFontSize,
            }}
            {...closeBtn.hoverProps}
          >
            Clear
          </button>
          <button
            onClick={toggleBottomPanel}
            style={{
              ...closeBtn.buttonStyle,
              background: closeBtn.hoverBg,
              color: TEXT.muted,
              padding: `${BUTTON.paddingY}px`,
              fontSize: 14,
            }}
            {...closeBtn.hoverProps}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          borderBottom: `1px solid ${BORDER.default}`,
          display: "grid",
          gap: SPACING.xs,
        }}
      >
        <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Main Agent Prompt</div>
        <textarea
          value={userPrompt}
          onChange={(event) => setUserPrompt(event.currentTarget.value)}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            background: SURFACE.editor,
            color: TEXT.primary,
            border: `1px solid ${BORDER.default}`,
            borderRadius: 6,
            padding: `${SPACING.xs}px ${SPACING.sm}px`,
            fontSize: TYPO.fontSize,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </div>

      {/* Status bar */}
      {latestRun && (
        <div
          style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`,
            fontSize: TYPO.smallFontSize,
            color: latestRun.state === "running" ? ACCENT.runGreen : latestRun.state === "failed" ? ACCENT.errorRed : TEXT.secondary,
            borderBottom: `1px solid ${BORDER.default}`,
            flexShrink: 0,
          }}
        >
          Run {latestRun.runId.slice(0, 8)}… — {latestRun.state}
          {latestRun.currentNodeId ? ` · ${latestRun.currentNodeId}` : ""}
        </div>
      )}

      {/* Event log */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: SPACING.sm,
          fontFamily: "monospace",
          fontSize: TYPO.smallFontSize,
          color: TEXT.secondary,
          whiteSpace: "pre-wrap",
        }}
      >
        {eventLines.length === 0 ? (
          <span style={{ color: TEXT.muted }}>
            {doc ? "Click Start to run this flow" : "No flow selected"}
          </span>
        ) : (
          eventLines.map((ev, i) => <div key={i}>{ev}</div>)
        )}
      </div>
    </div>
  );
}