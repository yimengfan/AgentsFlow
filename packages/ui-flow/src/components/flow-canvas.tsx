import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type { FlowDefinition, NodeDef, EdgeDef } from "@agentsflow/flow-schema";

/**
 * Custom agent node component for the flow canvas.
 */
function AgentNode({ data }: { data: { label: string; agentId: string; nodeType: string } }) {
  return (
    <div
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        background: data.nodeType === "agent" ? "#4f46e5" : "#6b7280",
        color: "#fff",
        fontSize: 12,
        fontWeight: 500,
        minWidth: 120,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.8 }}>{data.agentId || data.nodeType}</div>
      <div>{data.label}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode as any,
  input: AgentNode as any,
  output: AgentNode as any,
  router: AgentNode as any,
};

/**
 * FlowCanvas — React Flow wrapper that renders a FlowDefinition as a visual graph.
 *
 * Accepts props for flow data and callbacks. This makes it reusable across
 * both the legacy FlowEditor and the new Workbench's FlowEditorSurface.
 */

export interface FlowCanvasProps {
  /** The flow definition to render */
  flow: FlowDefinition | null;
  /** Currently selected node ID */
  selectedNodeId?: string | null;
  /** Callback when a node is selected */
  onSelectNode?: (nodeId: string | null) => void;
  /** Callback when two nodes are connected */
  onAddEdge?: (edge: EdgeDef) => void;
}

export function FlowCanvas({
  flow,
  selectedNodeId,
  onSelectNode,
  onAddEdge,
}: FlowCanvasProps) {
  // Convert FlowDefinition nodes → React Flow nodes
  const rfNodes: Node[] = useMemo(() => {
    if (!flow) return [];
    const positions = new Map(
      (flow.layout?.positions ?? []).map((p) => [p.nodeId, p]),
    );
    return flow.graph.nodes.map((n: NodeDef) => {
      const pos = positions.get(n.nodeId);
      return {
        id: n.nodeId,
        type: n.nodeType || "agent",
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        data: {
          label: n.label || n.nodeId,
          agentId: n.agentId || "",
          nodeType: n.nodeType || "agent",
        },
      };
    });
  }, [flow]);

  // Convert FlowDefinition edges → React Flow edges
  const rfEdges: Edge[] = useMemo(() => {
    if (!flow) return [];
    return flow.graph.edges.map((e, i) => ({
      id: `edge-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      label: e.label,
      animated: e.condition !== undefined,
    }));
  }, [flow]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "select" && change.id) {
          onSelectNode?.(change.selected ? change.id : null);
        }
      }
    },
    [onSelectNode],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      void changes;
    },
    [],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onAddEdge?.({
          source: connection.source,
          target: connection.target,
          ...(connection.sourceHandle ? { sourceHandle: connection.sourceHandle } : {}),
        });
      }
    },
    [onAddEdge],
  );

  if (!flow) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af" }}>
        No flow loaded
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      style={{ background: "#1e1e2e" }}
    >
      <Background color="#333" gap={20} />
      <Controls style={{ background: "#2d2d3f" }} />
      <MiniMap
        style={{ background: "#2d2d3f" }}
        nodeColor={(n) => (n.type === "agent" ? "#4f46e5" : "#6b7280")}
      />
    </ReactFlow>
  );
}
