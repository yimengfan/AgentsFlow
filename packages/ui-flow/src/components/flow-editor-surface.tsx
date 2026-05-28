import { useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowCanvas } from "./flow-canvas.js";
import { NodeInspector, type YamlRevealTarget } from "./node-inspector.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { BORDER } from "./workbench-tokens.js";
import type { NodeSpec } from "@agentsflow/node-spec-registry";

/**
 * FlowEditorSurface — center-only editor content: canvas with conditional inspector.
 *
 * Layout: Canvas fills the full area when no node or edge is selected.
 * When a node or edge is selected, a right-side inspector panel slides in via
 * react-resizable-panels. No bottom YAML editor panel.
 *
 * Props:
 *   flowPath — identifies which document in WorkspaceStore to edit
 */

interface FlowEditorSurfaceProps {
  readonly flowPath: string;
}

export function FlowEditorSurface({ flowPath }: FlowEditorSurfaceProps) {
  const doc = useWorkspaceStore((s) => s.documents.get(flowPath));
  const updateYaml = useWorkspaceStore((s) => s.updateYaml);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const addNode = useWorkspaceStore((s) => s.addNode);
  const addEdge = useWorkspaceStore((s) => s.addEdge);
  const moveNode = useWorkspaceStore((s) => s.moveNode);
  const removeNode = useWorkspaceStore((s) => s.removeNode);
  const removeEdge = useWorkspaceStore((s) => s.removeEdge);
  const selectEdge = useWorkspaceStore((s) => s.selectEdge);
  const handleRevealYaml = useCallback(
    (_target: YamlRevealTarget) => {
      // Reveal YAML is currently disabled (no YAML editor panel).
      // This callback is kept for future re-enablement.
    },
    [],
  );

  if (!doc) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7280",
        }}
      >
        Document not found
      </div>
    );
  }

  const hasSelection = doc.selectedNodeId !== null || doc.selectedEdgeId !== null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "row" }}>
      {/* Canvas — fills remaining width when inspector is shown, or full width otherwise */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <ReactFlowProvider>
          <FlowCanvas
            flow={doc.flow}
            selectedNodeId={doc.selectedNodeId}
            onSelectNode={selectNode}
            onAddEdge={(edge) => {
              addEdge(flowPath, edge);
            }}
            onMoveNode={(nodeId: string, position: { x: number; y: number }) => {
              moveNode(flowPath, nodeId, position);
            }}
            onAddNode={(spec: NodeSpec, position: { x: number; y: number }) => {
              return addNode(flowPath, spec, position);
            }}
            onRemoveNode={(nodeId: string) => {
              removeNode(flowPath, nodeId);
            }}
            onRemoveEdge={(source: string, target: string, sourceHandle?: string, targetHandle?: string) => {
              removeEdge(flowPath, source, target, sourceHandle, targetHandle);
            }}
            onSelectEdge={(edgeId: string | null) => {
              selectEdge(edgeId);
            }}
          />
        </ReactFlowProvider>
      </div>

      {/* Inspector panel — rendered when a node or edge is selected */}
      {hasSelection ? (
        <div style={{ width: 272, flexShrink: 0, borderLeft: `1px solid ${BORDER.default}` }}>
          <NodeInspector
            flowPath={flowPath}
            flow={doc.flow}
            selectedNodeId={doc.selectedNodeId}
            selectedEdgeId={doc.selectedEdgeId}
            onRevealYaml={handleRevealYaml}
            onSelectNode={selectNode}
          />
        </div>
      ) : null}
    </div>
  );
}