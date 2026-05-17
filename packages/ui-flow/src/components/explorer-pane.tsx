import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { useEffect, useCallback } from "react";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";

/**
 * ExplorerPane — file/directory browser in the left sidebar.
 *
 * Uses usePlatform().flow.list() to load the flow list.
 * Clicking a flow opens it in the center editor.
 *
 * Layout invariant: fills the sidebar content area.
 * Must NOT set width or height — the sidebar panel controls that.
 */

export function ExplorerPane() {
  const flowList = useWorkspaceStore((s) => s.flowList);
  const setFlowList = useWorkspaceStore((s) => s.setFlowList);
  const openFlow = useWorkspaceStore((s) => s.openFlow);
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const isLoading = useWorkspaceStore((s) => s.isLoading);

  const { flow } = usePlatform();

  // Load flow list on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await flow.list();
        if (!cancelled) {
          setFlowList(
            list.map((f: any) => ({
              flowPath: f.flowPath,
              name: f.name ?? f.flowPath,
              nodeCount: f.nodeCount ?? 0,
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load flow list:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [flow, setFlowList]);

  const handleOpenFlow = useCallback(
    async (flowPath: string) => {
      try {
        const yaml = await flow.load(flowPath);
        openFlow(flowPath, yaml);
      } catch (err) {
        console.error("Failed to load flow:", flowPath, err);
      }
    },
    [flow, openFlow],
  );

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
        Explorer
      </div>

      {/* File list */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: `${SPACING.xs}px 0`,
        }}
      >
        {flowList.length === 0 && (
          <div
            style={{
              padding: SPACING.md,
              color: TEXT.muted,
              fontSize: TYPO.fontSize,
              textAlign: "center",
            }}
          >
            {isLoading ? "Loading..." : "No flows found"}
          </div>
        )}

        {flowList.map((f) => {
          const isActive = f.flowPath === activeFlowPath;
          return (
            <button
              key={f.flowPath}
              onClick={() => handleOpenFlow(f.flowPath)}
              style={{
                display: "block",
                width: "100%",
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                background: isActive ? ACCENT.indigo + "26" : "transparent",
                borderLeft: isActive
                  ? `2px solid ${BORDER.active}`
                  : "2px solid transparent",
                borderRight: "none",
                borderTop: "none",
                borderBottom: "none",
                color: isActive ? TEXT.primary : TEXT.secondary,
                cursor: "pointer",
                textAlign: "left",
                fontSize: TYPO.fontSize,
                borderRadius: BUTTON.borderRadius,
                transition: `background-color ${BUTTON.transitionMs}ms ease, color ${BUTTON.transitionMs}ms ease`,
              }}
            >
              <div style={{ fontWeight: isActive ? 500 : 400 }}>
                {f.name}
              </div>
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted, marginTop: 2 }}>
                {f.nodeCount} nodes
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}