import { useWorkspaceStore } from "../store/workspace-store.js";
import { useRuntimeStore } from "../store/runtime-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO } from "./workbench-tokens.js";

/**
 * PreviewPane — live preview / debug view in the left sidebar.
 *
 * Placeholder: will show a live preview of the running flow,
 * step-by-step execution trace, and debug output.
 *
 * Layout invariant: fills the sidebar content area.
 * Must NOT set width or height — the sidebar panel controls that.
 */

export function PreviewPane() {
  const activeFlowPath = useWorkspaceStore((state) => state.activeFlowPath);
  const latestRun = useRuntimeStore((state) => (activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) ?? null : null));

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          fontWeight: 600,
          color: TEXT.secondary,
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        Preview
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: SPACING.md,
          display: "grid",
          gap: SPACING.sm,
        }}
      >
        {!latestRun ? (
          <div style={{ color: TEXT.muted, fontSize: TYPO.fontSize }}>还没有本地运行记录。</div>
        ) : (
          <>
            <div
              style={{
                padding: SPACING.sm,
                borderRadius: 6,
                background: SURFACE.editor,
                border: `1px solid ${BORDER.default}`,
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ color: TEXT.primary, fontSize: TYPO.fontSize, fontWeight: 600 }}>{latestRun.flowName}</div>
              <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>
                状态: {latestRun.state}
                {latestRun.currentNodeId ? ` · 当前节点 ${latestRun.currentNodeId}` : ""}
              </div>
              <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>事件数: {latestRun.events.length}</div>
            </div>

            {[...latestRun.nodeStates.values()].map((node) => (
              <div
                key={node.nodeId}
                style={{
                  padding: SPACING.sm,
                  borderRadius: 6,
                  background: SURFACE.editor,
                  border: `1px solid ${BORDER.default}`,
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>{node.label}</div>
                <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>
                  {node.nodeKind}
                  {node.agentId ? ` · ${node.agentId}` : ""}
                  {` · ${node.status}`}
                </div>
                <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize, whiteSpace: "pre-wrap" }}>
                  {node.finalText ?? (node.structuredOutput ? JSON.stringify(node.structuredOutput, null, 2) : "暂无输出")}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
