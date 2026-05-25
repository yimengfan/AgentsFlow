import React, { useCallback, useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnReconnect,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type IsValidConnection,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
  useReactFlow,
  applyNodeChanges,
} from "@xyflow/react";
import type { FlowDefinition, NodeDef, EdgeDef, PortDataType } from "@agentsflow/flow-schema";
import type { NodeSpec } from "@agentsflow/node-spec-registry";
import { NodeContextMenu, portColor } from "./node-context-menu.js";
import { SURFACE, BORDER, TEXT, TYPO, SPACING, ACCENT } from "./workbench-tokens.js";
import { buildFlowRegistry, countNodesByKind, validateConnection } from "../lib/flow-graph.js";
import { useRuntimeStore } from "../store/runtime-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useSettingsStore } from "../store/settings-store.js";

// ─── Node kind → color ─────────────────────────────────────

function kindColor(kind: string): string {
  if (kind === "agent.main") return "#4f46e5";
  if (kind === "agent.sub" || kind === "agent") return "#6366f1";
  if (kind.startsWith("agent.")) return "#6366f1";
  if (kind.startsWith("loader.")) return "#0d9488";
  if (kind.startsWith("control.")) return "#d97706";
  if (kind.startsWith("router.")) return "#8b5cf6";
  return "#6b7280";
}

// ─── Icon helper ────────────────────────────────────────────

function iconForKind(kind: string): string {
  if (kind.startsWith("agent.")) return "🤖";
  if (kind.startsWith("loader.")) return "📦";
  if (kind.startsWith("control.")) return "🔄";
  return "📦";
}

function iconForSpec(spec: NodeSpec | undefined, kind: string): string {
  const iconMap: Record<string, string> = {
    globe: "🌐",
    "folder-open": "📂",
    bot: "🤖",
    repeat: "🔁",
    flag: "🚩",
  };
  if (spec) {
    return iconMap[spec.icon] ?? iconForKind(kind);
  }
  return iconForKind(kind);
}

// ─── Spec-aware node renderer ──────────────────────────────

interface AgentNodeData {
  label: string;
  agentId: string;
  nodeKind: string;
  nodeType?: string;
  spec?: NodeSpec;
  agentRef?: string;
  model?: string;
  outputKind?: string;
  inputPorts: ReadonlyArray<{ portId: string; dataType: PortDataType; required?: boolean; label?: string }>;
  outputPorts: ReadonlyArray<{ portId: string; dataType: PortDataType; required?: boolean; label?: string }>;
}

function SpecNode({ data, selected, id }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const effectiveKind = d.nodeKind ?? "agent";
  const bg = kindColor(effectiveKind);
  const spec = d.spec;
  const nodeId = id;
  const instanceInputPorts = d.inputPorts ?? [];
  const instanceOutputPorts = d.outputPorts ?? [];

  // Resolve agent.md data from manifest for this node
  const promptAssetManifest = useWorkspaceStore((s) => s.promptAssetManifest);
  const resolvedAgent = d.agentRef && promptAssetManifest
    ? promptAssetManifest.agents.get(d.agentRef)
    : undefined;

  // Resolve display name:
  // - If agentRef is set, show the agent.md name (strip path + .agent.md suffix)
  // - If agentRef is NOT set, show "kind (spec.label)" — e.g. "agent.main (主 Agent)"
  const agentDisplayName = d.agentRef
    ? (resolvedAgent?.name ?? d.agentRef.split("/").pop()?.replace(/\.agent\.md$/, "") ?? d.agentRef)
    : `${spec?.kind ?? effectiveKind} (${spec?.label ?? effectiveKind})`;

  // Resolve outputKind from agent.md (not from node config)
  const resolvedOutputKind = resolvedAgent?.outputKind;

  // Resolve model with cascade: node config → agent.md → global default
  const defaultModelKey = useSettingsStore((s) => s.defaultModelKey);
  const resolvedModel = (() => {
    if (d.model) return { source: "node" as const, value: d.model };
    if (resolvedAgent?.model) return { source: "agent.md" as const, value: resolvedAgent.model };
    if (defaultModelKey) return { source: "global" as const, value: defaultModelKey };
    return null;
  })();
  const isAgentKind = effectiveKind === "agent" || effectiveKind.startsWith("agent.");

  // Read runtime status for this node
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const nodeState = useRuntimeStore((state) => {
    const run = activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) : undefined;
    return run?.nodeStates.get(nodeId);
  });
  const nodeStatus = nodeState?.status ?? "idle";
  const nodeStreaming = nodeState?.status === "running" ? nodeState.streamingText ?? null : null;
  const nodeDurationMs = nodeState?.durationMs;
  const nodeErrorTrace = nodeState?.errorTrace;

  // Build input handles from spec (or default single "in" handle)
  const inputPorts = instanceInputPorts.length > 0
    ? [...instanceInputPorts]
    : spec
      ? [...spec.inputPorts]
    : [{ portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" }];

  // Build output handles from spec (or default single "out" handle)
  const outputPorts = instanceOutputPorts.length > 0
    ? [...instanceOutputPorts]
    : spec
      ? [...spec.outputPorts]
    : [{ portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" }];

  // Determine flow direction from spec (default: horizontal = left→right)
  const flowDirection = spec?.flowDirection ?? "horizontal";

  // Separate flow ports from data ports
  const inputFlowPorts = inputPorts.filter((p) => p.dataType === "flow");
  const inputDataPorts = inputPorts.filter((p) => p.dataType !== "flow");
  const outputFlowPorts = outputPorts.filter((p) => p.dataType === "flow");
  const outputDataPorts = outputPorts.filter((p) => p.dataType !== "flow");

  // For horizontal (left→right) flow:
  //   flow ports: input on Left, output on Right
  //   data ports: input on Top, output on Bottom
  // For vertical (top→bottom) flow (legacy):
  //   flow ports: input on Top, output on Bottom
  //   data ports: input on Left, output on Right
  const isHorizontal = flowDirection === "horizontal";

  const flowTargetPos = isHorizontal ? Position.Left : Position.Top;
  const flowSourcePos = isHorizontal ? Position.Right : Position.Bottom;
  const dataTargetPos = isHorizontal ? Position.Top : Position.Left;
  const dataSourcePos = isHorizontal ? Position.Bottom : Position.Right;

  // Compute flow port spacing
  const flowTargetOffset = (i: number) => isHorizontal
    ? { top: `${28 + i * 14}px`, left: -4 }
    : { left: `${10 + i * 12}px`, top: -4 };

  const flowSourceOffset = (i: number) => isHorizontal
    ? { top: `${28 + i * 14}px`, right: -4 }
    : { left: `${10 + i * 12}px`, bottom: -4 };

  const dataTargetOffset = (i: number) => isHorizontal
    ? { left: `${14 + i * 14}px`, top: -4 }
    : { top: `${28 + i * 12}px`, left: -4 };

  const dataSourceOffset = (i: number) => isHorizontal
    ? { left: `${14 + i * 14}px`, bottom: -4 }
    : { top: `${28 + i * 12}px`, right: -4 };

  // Runtime status badge style
  const statusBorderColor =
    nodeStatus === "running"
      ? ACCENT.alertAmber
      : nodeStatus === "completed"
        ? ACCENT.runGreen
        : nodeStatus === "failed"
          ? ACCENT.errorRed
          : "transparent";
  const statusPulse = nodeStatus === "running";

  return (
    <div
      data-node-kind={effectiveKind}
      className={`af-node af-node--${effectiveKind.replace(/\./g, "-")}`}
      style={{
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        borderRadius: 6,
        background: bg,
        color: "#fff",
        fontSize: TYPO.fontSize,
        fontWeight: 500,
        minWidth: isHorizontal ? 180 : 140,
        maxWidth: 240,
        position: "relative",
        border: statusBorderColor !== "transparent" ? `2px solid ${statusBorderColor}` : undefined,
        ...(statusPulse ? { animation: "af-pulse-border 1.5s ease-in-out infinite" } : {}),
      }}
    >
      {/* Runtime status badge */}
      {nodeStatus !== "idle" && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: statusBorderColor,
            border: `2px solid ${bg}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            color: "#fff",
            ...(statusPulse ? { animation: "af-pulse-dot 1.5s ease-in-out infinite" } : {}),
          }}
        >
          {nodeStatus === "running" ? "⟳" : nodeStatus === "completed" ? "✓" : "✗"}
        </div>
      )}
      {/* Duration label badge (top-left) */}
      {nodeDurationMs !== undefined && nodeStatus !== "running" && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            padding: "0px 4px",
            borderRadius: 3,
            background: "rgba(0,0,0,0.7)",
            color: "#93c5fd",
            fontSize: 9,
            fontWeight: 600,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            lineHeight: "14px",
            whiteSpace: "nowrap",
          }}
        >
          {nodeDurationMs >= 1000 ? `${(nodeDurationMs / 1000).toFixed(1)}s` : `${nodeDurationMs}ms`}
        </div>
      )}
      {/* Error indicator (bottom-left corner) */}
      {nodeErrorTrace && nodeStatus === "failed" && (
        <div
          title={`${nodeErrorTrace.code}: ${nodeErrorTrace.message}`}
          style={{
            position: "absolute",
            bottom: -6,
            left: -6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: ACCENT.errorRed,
            border: `2px solid ${bg}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 7,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          !
        </div>
      )}
      {/* Header: kind (small) */}
      <div
        style={{
          fontSize: TYPO.smallFontSize - 1,
          opacity: 0.65,
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {iconForSpec(spec, effectiveKind)} {spec ? `${spec.kind}(${spec.label})` : effectiveKind}
      </div>
      {/* Agent name (slightly larger, prominent) — or compact red warning if no agent */}
      <div
        style={{
          fontSize: TYPO.fontSize + 2,
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...(isAgentKind && !d.agentRef
            ? {
                fontSize: TYPO.fontSize - 1,
                fontWeight: 500,
                lineHeight: "16px",
                color: "#f87171",
                background: "rgba(248, 113, 113, 0.15)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: 3,
                padding: "1px 4px",
              }
            : {}),
        }}
      >
        {isAgentKind && !d.agentRef
          ? "⚠️ 请选择 agent.md"
          : agentDisplayName}
      </div>
      {/* Output type badge — always show, derived from agent.md */}
      {isAgentKind && resolvedOutputKind && (
        <div
          style={{
            display: "inline-block",
            marginTop: 3,
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: TYPO.smallFontSize - 1,
            fontWeight: 500,
            background: "rgba(255,255,255,0.18)",
            whiteSpace: "nowrap",
          }}
        >
          📤 {resolvedOutputKind}
        </div>
      )}
      {/* Model name (small) — show resolved model from cascade */}
      {resolvedModel && (
        <div
          style={{
            fontSize: TYPO.smallFontSize - 1,
            opacity: 0.6,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {resolvedModel.value.includes("/")
            ? `${resolvedModel.value.split("/").pop()} (${resolvedModel.value.split("/")[0]})`
            : resolvedModel.value}
          {resolvedModel.source !== "node" && (
            <span style={{ opacity: 0.5, marginLeft: 4, fontSize: TYPO.smallFontSize - 2 }}>↳{resolvedModel.source === "agent.md" ? "agent.md" : "全局"}</span>
          )}
        </div>
      )}

      {/* Warning: no model available for agent nodes */}
      {isAgentKind && !resolvedModel && (
        <div
          style={{
            position: "absolute",
            bottom: `${SPACING.sm}px`,
            left: `${SPACING.md}px`,
            right: `${SPACING.md}px`,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(248, 113, 113, 0.2)",
            border: "1px solid rgba(248, 113, 113, 0.4)",
            color: "#f87171",
            fontSize: TYPO.smallFontSize - 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          ⚠️ 请增加全局设置 model
        </div>
      )}

      {/* Input handles — flow ports */}
      {inputFlowPorts.map((p, i) => (
        <Handle
          key={p.portId}
          type="target"
          position={flowTargetPos}
          id={p.portId}
          style={{
            background: portColor(p.dataType),
            width: 10,
            height: 10,
            ...flowTargetOffset(i),
            border: `2px solid ${bg}`,
          }}
        />
      ))}
      {/* Input handles — data ports */}
      {inputDataPorts.map((p, i) => (
        <Handle
          key={p.portId}
          type="target"
          position={dataTargetPos}
          id={p.portId}
          style={{
            background: portColor(p.dataType),
            width: 10,
            height: 10,
            ...dataTargetOffset(i),
            border: `2px solid ${bg}`,
          }}
        />
      ))}

      {/* Output handles — flow ports */}
      {outputFlowPorts.map((p, i) => (
        <Handle
          key={p.portId}
          type="source"
          position={flowSourcePos}
          id={p.portId}
          style={{
            background: portColor(p.dataType),
            width: 10,
            height: 10,
            ...flowSourceOffset(i),
            border: `2px solid ${bg}`,
          }}
        />
      ))}
      {/* Output handles — data ports */}
      {outputDataPorts.map((p, i) => (
        <Handle
          key={p.portId}
          type="source"
          position={dataSourcePos}
          id={p.portId}
          style={{
            background: portColor(p.dataType),
            width: 10,
            height: 10,
            ...dataSourceOffset(i),
            border: `2px solid ${bg}`,
          }}
        />
      ))}

      {/* Runtime streaming text preview */}
      {nodeStreaming && (
        <div
          style={{
            fontSize: TYPO.smallFontSize - 2,
            opacity: 0.7,
            marginTop: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
          }}
        >
          {nodeStreaming.slice(0, 60)}…
          <span
            style={{
              display: "inline-block",
              width: 4,
              height: 8,
              background: "#fff",
              borderRadius: 1,
              marginLeft: 2,
              animation: "af-blink 0.6s ease-in-out infinite",
              verticalAlign: "text-bottom",
            }}
          />
        </div>
      )}

      {/* Error message preview on failed nodes */}
      {nodeErrorTrace && nodeStatus === "failed" && (
        <div
          style={{
            fontSize: TYPO.smallFontSize - 2,
            opacity: 0.85,
            marginTop: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
            color: "#fca5a5",
          }}
        >
          ❌ {nodeErrorTrace.message}
        </div>
      )}


    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: SpecNode as any,
  input: SpecNode as any,
  output: SpecNode as any,
  router: SpecNode as any,
  loader: SpecNode as any,
  control: SpecNode as any,
};

// ─── Data Preview Edge ─────────────────────────────────────

/**
 * Custom edge component that shows a data preview tooltip on hover.
 * Displays the source node's port output and target node's input for the
 * connected handles, pulled from the runtime store's nodeStates.
 */
function DataPreviewEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  animated,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);

  // Get node debug states from the runtime store for the active flow
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const latestRun = useRuntimeStore((state) =>
    activeFlowPath ? state.runsByFlowPath.get(activeFlowPath) ?? null : null,
  );

  // Compute data preview for this edge
  const sourceNodeState = latestRun?.nodeStates.get(source);
  const targetNodeState = latestRun?.nodeStates.get(target);

  // Source output (from portOutputs keyed by sourceHandleId)
  const sourceOutput = sourceHandleId
    ? sourceNodeState?.portOutputs[sourceHandleId]
    : sourceNodeState?.portOutputs["out"] ?? sourceNodeState?.finalText;

  // Target input (from inputs keyed by targetHandleId)
  const targetInput = targetHandleId
    ? targetNodeState?.inputs[targetHandleId]
    : targetNodeState?.inputs["in"] ?? targetNodeState?.inputs["previousResult"];

  const hasData = sourceOutput !== undefined || targetInput !== undefined;
  const edgeData = data as { dataEdge?: boolean } | undefined;
  const isDataEdge = edgeData?.dataEdge === true || !!(sourceHandleId && targetHandleId);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  // Format a data value for display
  const formatDataValue = (value: unknown): string => {
    if (value === undefined) return "";
    if (typeof value === "string") {
      return value.length > 100 ? value.slice(0, 100) + "…" : value;
    }
    try {
      const json = JSON.stringify(value, null, 2);
      return json.length > 200 ? json.slice(0, 200) + "…" : json;
    } catch {
      return String(value);
    }
  };

  const edgeStroke = isDataEdge ? "#a78bfa" : ((style?.stroke as string) ?? "#6b7280");

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ cursor: "pointer" }}
      />
      {/* Visible edge path */}
      <path
        d={edgePath}
        fill="none"
        stroke={selected ? "#60a5fa" : edgeStroke}
        strokeWidth={selected ? 3 : (isDataEdge ? 2 : 1.5)}
        markerEnd={markerEnd}
        className={animated ? "animated" : ""}
        style={{
          ...(selected ? { filter: "drop-shadow(0 0 4px rgba(96, 165, 250, 0.5))" } : {}),
        }}
      />

      {/* Small data indicator dot on the edge midpoint */}
      {hasData && !hovered && (
        <circle
          cx={labelX}
          cy={labelY}
          r={4}
          fill={ACCENT.runGreen}
          stroke={SURFACE.editor}
          strokeWidth={1.5}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Data preview tooltip on hover */}
      {hovered && hasData && (
        <foreignObject
          x={labelX - 120}
          y={labelY - 10}
          width={240}
          height={180}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{
              background: SURFACE.sidebar,
              border: `1px solid ${BORDER.default}`,
              borderRadius: 6,
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              fontSize: TYPO.smallFontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              maxWidth: 240,
              maxHeight: 180,
              overflow: "auto",
              color: TEXT.primary,
            }}
          >
            <div style={{ color: ACCENT.indigo, fontWeight: 600, marginBottom: 4, fontSize: TYPO.smallFontSize }}>
              📊 Data Flow
            </div>
            {sourceOutput !== undefined && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize, marginBottom: 2 }}>
                  ↓ Output{sourceHandleId ? ` (${sourceHandleId})` : ""}
                </div>
                <div
                  style={{
                    color: TEXT.primary,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    background: SURFACE.editor,
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    borderRadius: 4,
                    border: `1px solid ${BORDER.default}`,
                  }}
                >
                  {formatDataValue(sourceOutput)}
                </div>
              </div>
            )}
            {targetInput !== undefined && (
              <div>
                <div style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize, marginBottom: 2 }}>
                  ↓ Input{targetHandleId ? ` (${targetHandleId})` : ""}
                </div>
                <div
                  style={{
                    color: TEXT.primary,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    background: SURFACE.editor,
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    borderRadius: 4,
                    border: `1px solid ${BORDER.default}`,
                  }}
                >
                  {formatDataValue(targetInput)}
                </div>
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

const edgeTypes: EdgeTypes = {
  dataPreview: DataPreviewEdge as any,
};

/**
 * Map a nodeKind string to one of our registered React Flow node type renderers.
 */
function mapToRfType(nodeKind: string): string {
  if (nodeKind in nodeTypes) return nodeKind;
  const prefix = nodeKind.split(".")[0] ?? "";
  if (prefix in nodeTypes) return prefix;
  return "agent";
}

// ─── Edge Context Menu ─────────────────────────────────────

interface EdgeContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly source: string;
  readonly target: string;
  onDelete: () => void;
  onClose: () => void;
}

function EdgeContextMenu({ x, y, source, target, onDelete, onClose }: EdgeContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  React.useEffect(() => {
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

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        minWidth: 160,
        background: SURFACE.sidebar,
        border: `1px solid ${BORDER.default}`,
        borderRadius: 6,
        padding: `${SPACING.xs}px 0`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          padding: `${SPACING.xs}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          color: TEXT.muted,
          borderBottom: `1px solid ${BORDER.default}`,
          marginBottom: 2,
        }}
      >
        {source} → {target}
      </div>
      <div
        onClick={onDelete}
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.fontSize,
          color: "#ef4444",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = SURFACE.panel;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        🗑️ 删除连线
      </div>
    </div>
  );
}

// ─── Node Delete Context Menu ──────────────────────────────

interface NodeDeleteContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly nodeLabel: string;
  onDelete: () => void;
  onClose: () => void;
}

function NodeDeleteContextMenu({ x, y, nodeLabel, onDelete, onClose }: NodeDeleteContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  React.useEffect(() => {
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

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        minWidth: 160,
        background: SURFACE.sidebar,
        border: `1px solid ${BORDER.default}`,
        borderRadius: 6,
        padding: `${SPACING.xs}px 0`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          padding: `${SPACING.xs}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          color: TEXT.muted,
          borderBottom: `1px solid ${BORDER.default}`,
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 200,
        }}
      >
        {nodeLabel}
      </div>
      <div
        onClick={onDelete}
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.fontSize,
          color: "#ef4444",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = SURFACE.panel;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        🗑️ 删除节点
      </div>
    </div>
  );
}

// ─── Canvas Props ──────────────────────────────────────────

export interface FlowCanvasProps {
  /** The flow definition to render */
  flow: FlowDefinition | null;
  /** Currently selected node ID */
  selectedNodeId?: string | null;
  /** Callback when a node is selected */
  onSelectNode?: (nodeId: string | null) => void;
  /** Callback when two nodes are connected */
  onAddEdge?: (edge: EdgeDef) => void;
  /** Callback when a node move should be persisted */
  onMoveNode?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Callback when a node is added via context menu */
  onAddNode?: (spec: NodeSpec, position: { x: number; y: number }) => string;
  /** Callback when a node is deleted */
  onRemoveNode?: (nodeId: string) => void;
  /** Callback when an edge is deleted */
  onRemoveEdge?: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => void;
  /** Callback when an edge is selected */
  onSelectEdge?: (edgeId: string | null) => void;
}

// ─── FlowCanvas ────────────────────────────────────────────

export function FlowCanvas({
  flow,
  selectedNodeId,
  onSelectNode,
  onAddEdge,
  onMoveNode,
  onAddNode,
  onRemoveNode,
  onRemoveEdge,
  onSelectEdge,
}: FlowCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  } | null>(null);
  const [nodeContextMenuState, setNodeContextMenuState] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeLabel: string;
  } | null>(null);
  const [connectionHint, setConnectionHint] = useState<string | null>(null);

  const reactFlowInstance = useReactFlow();
  const registry = useMemo(() => buildFlowRegistry(flow), [flow]);
  const nodeKindCounts = useMemo(() => countNodesByKind(flow), [flow]);

  // Local node state for smooth dragging (synced from flow on change, updated by React Flow during drag)
  const [localNodes, setLocalNodes] = useState<Node[]>([]);

  // Sync from flow definition to local state when flow changes
  const rfNodes: Node[] = useMemo(() => {
    if (!flow) return [];
    const positions = new Map(
      (flow.layout?.positions ?? []).map((p) => [p.nodeId, p]),
    );
    return flow.graph.nodes.map((n: NodeDef) => {
      const pos = positions.get(n.nodeId);
      const effectiveKind = n.nodeKind ?? n.nodeType ?? "agent";
      const rfType = mapToRfType(effectiveKind);
      const spec = registry.resolve(n.nodeKind, n.nodeType);
      return {
        id: n.nodeId,
        type: rfType,
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        data: {
          label: n.label || n.nodeId,
          agentId: n.agentId || "",
          nodeKind: effectiveKind,
          nodeType: n.nodeType,
          spec,
          agentRef: n.agentRef ?? undefined,
          model: typeof (n.config as Record<string, unknown>)?.model === "string" ? (n.config as Record<string, unknown>).model as string : undefined,
          outputKind: typeof (n.config as Record<string, unknown>)?.outputKind === "string" ? (n.config as Record<string, unknown>).outputKind as string : undefined,
          inputPorts: [...n.inputPorts],
          outputPorts: [...n.outputPorts],
        },
        selected: n.nodeId === selectedNodeId,
      };
    });
  }, [flow, selectedNodeId, onRemoveNode]);

  // Keep localNodes in sync with rfNodes (re-sync when flow data changes)
  useEffect(() => {
    setLocalNodes(rfNodes);
  }, [rfNodes]);

  // Convert FlowDefinition edges → React Flow edges
  const rfEdges: Edge[] = useMemo(() => {
    if (!flow) return [];
    return flow.graph.edges.map((e, i) => ({
      id: `edge-${e.source}-${e.target}-${i}`,
      type: "dataPreview",
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
      reconnectable: true,
      selectable: true,
      label: e.label,
      animated: e.condition !== undefined || e.dataEdge,
      style: e.dataEdge
        ? { stroke: "#a78bfa", strokeWidth: 2 }
        : { stroke: "#6b7280", strokeWidth: 1.5 },
      data: { dataEdge: e.dataEdge ?? false },
    }));
  }, [flow]);

  // Apply all node changes to local state for smooth dragging;
  // persist position to store only on drag end.
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply changes to local React Flow state (enables smooth drag)
      setLocalNodes((nds) => applyNodeChanges(changes, nds));

      for (const change of changes) {
        if (change.type === "select" && change.id) {
          onSelectNode?.(change.selected ? change.id : null);
        }
        // Persist position to store only when drag ends
        if (change.type === "position" && change.position && change.dragging === false) {
          onMoveNode?.(change.id, change.position);
        }
        // Handle node deletion via keyboard (Backspace/Delete)
        if (change.type === "remove" && change.id) {
          onRemoveNode?.(change.id);
        }
      }
    },
    [onMoveNode, onSelectNode, onRemoveNode],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "select" && change.id) {
          onSelectEdge?.(change.selected ? change.id : null);
        }
        if (change.type === "remove" && change.id) {
          // Find the edge in flow definition to get source/target
          const rfEdge = rfEdges.find((e) => e.id === change.id);
          if (rfEdge) {
            onRemoveEdge?.(
              rfEdge.source,
              rfEdge.target,
              rfEdge.sourceHandle ?? undefined,
              rfEdge.targetHandle ?? undefined,
            );
          }
        }
      }
    },
    [onRemoveEdge, onSelectEdge, rfEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const result = validateConnection(flow, {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });

        if (!result.valid || !result.edge) {
          setConnectionHint(result.reason ?? "当前连接不合法");
          return;
        }

        setConnectionHint(null);
        onAddEdge?.(result.edge);
      }
    },
    [flow, onAddEdge],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) =>
      validateConnection(flow, {
        source: connection.source ?? "",
        target: connection.target ?? "",
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      }).valid,
    [flow],
  );

  // Handle edge reconnection — user drags an existing edge endpoint to a new handle
  const onReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;

      // Validate the new connection
      const result = validateConnection(flow, {
        source: newConnection.source,
        target: newConnection.target,
        sourceHandle: newConnection.sourceHandle,
        targetHandle: newConnection.targetHandle,
      });

      if (!result.valid || !result.edge) {
        setConnectionHint(result.reason ?? "重新连接不合法");
        return;
      }

      setConnectionHint(null);

      // Remove the old edge first, then add the new one
      onRemoveEdge?.(
        oldEdge.source,
        oldEdge.target,
        oldEdge.sourceHandle ?? undefined,
        oldEdge.targetHandle ?? undefined,
      );
      onAddEdge?.(result.edge);
    },
    [flow, onRemoveEdge, onAddEdge],
  );

  // Right-click context menu handlers
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();

      const screenX = (event as MouseEvent).clientX;
      const screenY = (event as MouseEvent).clientY;

      // Convert screen position to flow coordinates
      const flowPos = reactFlowInstance.screenToFlowPosition({
        x: screenX,
        y: screenY,
      });

      setContextMenu({ x: screenX, y: screenY, flowPos });
    },
    [reactFlowInstance],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      const d = node.data as unknown as AgentNodeData;
      setNodeContextMenuState({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
        nodeId: node.id,
        nodeLabel: d.label || node.id,
      });
    },
    [],
  );

  const handleNodeDelete = useCallback(
    () => {
      if (nodeContextMenuState) {
        onRemoveNode?.(nodeContextMenuState.nodeId);
        setNodeContextMenuState(null);
      }
    },
    [nodeContextMenuState, onRemoveNode],
  );

  const handleNodeContextMenuClose = useCallback(() => {
    setNodeContextMenuState(null);
  }, []);

  // Handle right-click on edges — show delete context menu
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, edge: Edge) => {
      event.preventDefault();
      setEdgeContextMenu({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      });
    },
    [],
  );

  const handleEdgeDelete = useCallback(
    () => {
      if (edgeContextMenu) {
        onRemoveEdge?.(
          edgeContextMenu.source,
          edgeContextMenu.target,
          edgeContextMenu.sourceHandle,
          edgeContextMenu.targetHandle,
        );
        setEdgeContextMenu(null);
      }
    },
    [edgeContextMenu, onRemoveEdge],
  );

  const handleEdgeContextMenuClose = useCallback(() => {
    setEdgeContextMenu(null);
  }, []);

  const handleMenuSelect = useCallback(
    (spec: NodeSpec) => {
      if (contextMenu && onAddNode) {
        onAddNode(spec, contextMenu.flowPos);
      }
      setContextMenu(null);
    },
    [contextMenu, onAddNode],
  );

  const handleMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Click on pane closes context menus
  const onPaneClick = useCallback(() => {
    if (contextMenu) {
      setContextMenu(null);
    }
    if (edgeContextMenu) {
      setEdgeContextMenu(null);
    }
    if (nodeContextMenuState) {
      setNodeContextMenuState(null);
    }
    if (connectionHint) {
      setConnectionHint(null);
    }
  }, [contextMenu, edgeContextMenu, nodeContextMenuState]);

  if (!flow) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: TEXT.muted,
          background: SURFACE.editor,
        }}
      >
        No flow loaded
      </div>
    );
  }

  return (
    <div style={{ height: "100%", width: "100%" }}>
      {/* Custom styles for selected edges — more visible on dark theme */}
      <style>{`
        .react-flow__edge.selected .react-flow__edge-path {
          stroke: #60a5fa !important;
          stroke-width: 3px !important;
          filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.5));
        }
        .react-flow__edge:hover .react-flow__edge-path {
          stroke: #93c5fd !important;
          stroke-width: 2.5px !important;
        }
        @keyframes af-pulse-border {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes af-pulse-dot {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        @keyframes af-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      <ReactFlow
        nodes={localNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onReconnect={onReconnect}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        style={{ background: SURFACE.editor }}
      >
        <Background color={BORDER.default} gap={20} />
        <Controls
          style={{
            background: SURFACE.sidebar,
            borderRadius: 4,
            border: `1px solid ${BORDER.default}`,
          }}
        />
        <MiniMap
          style={{
            background: SURFACE.sidebar,
            border: `1px solid ${BORDER.default}`,
            borderRadius: 4,
          }}
          nodeColor={(n) => {
            const nd = n.data as unknown as AgentNodeData;
            return kindColor(nd.nodeKind ?? "agent");
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>

      {/* Context menu overlay */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          registry={registry}
          nodeKindCounts={nodeKindCounts}
          onSelect={handleMenuSelect}
          onClose={handleMenuClose}
        />
      )}

      {/* Edge context menu overlay */}
      {edgeContextMenu && (
        <EdgeContextMenu
          x={edgeContextMenu.x}
          y={edgeContextMenu.y}
          source={edgeContextMenu.source}
          target={edgeContextMenu.target}
          onDelete={handleEdgeDelete}
          onClose={handleEdgeContextMenuClose}
        />
      )}

      {/* Node right-click delete context menu overlay */}
      {nodeContextMenuState && (
        <NodeDeleteContextMenu
          x={nodeContextMenuState.x}
          y={nodeContextMenuState.y}
          nodeLabel={nodeContextMenuState.nodeLabel}
          onDelete={handleNodeDelete}
          onClose={handleNodeContextMenuClose}
        />
      )}

      {connectionHint ? (
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            padding: `${SPACING.xs}px ${SPACING.md}px`,
            borderRadius: 6,
            background: "rgba(127, 29, 29, 0.92)",
            border: "1px solid rgba(248, 113, 113, 0.45)",
            color: "#fee2e2",
            fontSize: TYPO.smallFontSize,
            pointerEvents: "none",
          }}
        >
          {connectionHint}
        </div>
      ) : null}
    </div>
  );
}
