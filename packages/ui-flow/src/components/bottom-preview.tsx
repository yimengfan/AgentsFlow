import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { useState, useCallback } from "react";
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
  const { run } = usePlatform();

  const doc = activeFlowPath ? documents.get(activeFlowPath) : null;
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [events, setEvents] = useState<readonly string[]>([]);

  const startBtn = usePrimaryButtonHover();
  const closeBtn = useButtonHover();

  const handleStart = useCallback(async () => {
    if (!activeFlowPath) return;
    try {
      setStatus("starting");
      const result = await run.start(activeFlowPath, {});
      setRunId(result.runId);
      setStatus("running");
      // Fetch initial events
      const runEvents = await run.getStatus(result.runId);
      setEvents([JSON.stringify(runEvents, null, 2)]);
    } catch (err) {
      setStatus("error");
      setEvents([`Error: ${String(err)}`]);
    }
  }, [activeFlowPath, run]);

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
            disabled={!doc?.flow || status === "running"}
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

      {/* Status bar */}
      {runId && (
        <div
          style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`,
            fontSize: TYPO.smallFontSize,
            color: status === "running" ? ACCENT.runGreen : status === "error" ? ACCENT.errorRed : TEXT.secondary,
            borderBottom: `1px solid ${BORDER.default}`,
            flexShrink: 0,
          }}
        >
          Run {runId.slice(0, 8)}… — {status}
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
        {events.length === 0 ? (
          <span style={{ color: TEXT.muted }}>
            {doc ? "Click Start to run this flow" : "No flow selected"}
          </span>
        ) : (
          events.map((ev, i) => <div key={i}>{ev}</div>)
        )}
      </div>
    </div>
  );
}