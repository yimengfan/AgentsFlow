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
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type IsValidConnection,
  type NodeProps,
  useReactFlow,
  applyNodeChanges,
} from "@xyflow/react";
import type { FlowDefinition, NodeDef, EdgeDef, PortDataType } from "@agentsflow/flow-schema";
import type { NodeSpec } from "@agentsflow/node-spec-registry";
import { NodeContextMenu, portColor } from "./node-context-menu.js";
import { SURFACE, BORDER, TEXT, TYPO, SPACING } from "./workbench-tokens.js";
import { buildFlowRegistry, countNodesByKind, validateConnection } from "../lib/flow-graph.js";

// ─── Node kind → color ─────────────────────────────────────

function kindColor(kind: string): string {
  if (kind === "agent" || kind.startsWith("agent.")) return "#4f46e5";
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
  inputPorts: ReadonlyArray<{ portId: string; dataType: PortDataType; required?: boolean; label?: string }>;
  outputPorts: ReadonlyArray<{ portId: string; dataType: PortDataType; required?: boolean; label?: string }>;
}

function SpecNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const effectiveKind = d.nodeKind ?? "agent";
  const bg = kindColor(effectiveKind);
  const spec = d.spec;
  const instanceInputPorts = d.inputPorts ?? [];
  const instanceOutputPorts = d.outputPorts ?? [];

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

  return (
    <div
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
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: TYPO.smallFontSize,
          opacity: 0.8,
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {iconForSpec(spec, effectiveKind)} {spec?.kind ?? effectiveKind}
      </div>
      <div
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {d.label || effectiveKind}
      </div>

      {/* Input handles — flow ports */}
      {inputFlowPorts.map((p, i) => (
        <Handle
          key={p.portId}
          type="target"
          position={flowTargetPos}
          id={p.portId}
          style={{
            background: portColor(p.dataType),
            width: 8,
            height: 8,
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
            width: 8,
            height: 8,
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
            width: 8,
            height: 8,
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
            width: 8,
            height: 8,
            ...dataSourceOffset(i),
            border: `2px solid ${bg}`,
          }}
        />
      ))}

      {/* Port labels (small, below node body) */}
      {outputDataPorts.length > 0 && (
        <div
          style={{
            fontSize: TYPO.smallFontSize - 1,
            opacity: 0.6,
            marginTop: 4,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {outputDataPorts.map((p) => (
            <span key={p.portId} style={{ color: portColor(p.dataType) }}>
              {p.label ?? p.portId}
            </span>
          ))}
        </div>
      )}
      {inputDataPorts.length > 0 && (
        <div
          style={{
            fontSize: TYPO.smallFontSize - 1,
            opacity: 0.6,
            marginTop: 2,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {inputDataPorts.map((p) => (
            <span key={p.portId} style={{ color: portColor(p.dataType) }}>
              {p.label ?? p.portId}
            </span>
          ))}
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

/**
 * Map a nodeKind string to one of our registered React Flow node type renderers.
 */
function mapToRfType(nodeKind: string): string {
  if (nodeKind in nodeTypes) return nodeKind;
  const prefix = nodeKind.split(".")[0] ?? "";
  if (prefix in nodeTypes) return prefix;
  return "agent";
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
}: FlowCanvasProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
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
          inputPorts: [...n.inputPorts],
          outputPorts: [...n.outputPorts],
        },
        selected: n.nodeId === selectedNodeId,
      };
    });
  }, [flow, selectedNodeId]);

  // Keep localNodes in sync with rfNodes (re-sync when flow data changes)
  useEffect(() => {
    setLocalNodes(rfNodes);
  }, [rfNodes]);

  // Convert FlowDefinition edges → React Flow edges
  const rfEdges: Edge[] = useMemo(() => {
    if (!flow) return [];
    return flow.graph.edges.map((e, i) => ({
      id: `edge-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
      label: e.label,
      animated: e.condition !== undefined || e.dataEdge,
      style: e.dataEdge
        ? { stroke: "#a78bfa", strokeWidth: 2 }
        : { stroke: "#6b7280", strokeWidth: 1.5 },
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
    [onRemoveEdge, rfEdges],
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
    (_event: React.MouseEvent | MouseEvent, _node: Node) => {
      _event.preventDefault();
    },
    [],
  );

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

  // Click on pane closes context menu
  const onPaneClick = useCallback(() => {
    if (contextMenu) {
      setContextMenu(null);
    }
    if (connectionHint) {
      setConnectionHint(null);
    }
  }, [contextMenu]);

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
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Backspace"
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
