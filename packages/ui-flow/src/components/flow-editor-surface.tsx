import { useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowCanvas } from "./flow-canvas.js";
import { NodeInspector, type YamlRevealTarget } from "./node-inspector.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { SURFACE, RESIZE_HANDLE } from "./workbench-tokens.js";
import type { NodeSpec } from "@agentsflow/node-spec-registry";

/**
 * FlowEditorSurface — center-only editor content: canvas with conditional inspector.
 *
 * Layout: Canvas fills the full area when no node is selected.
 * When a node is selected, a right-side inspector panel slides in via
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

  const hasSelection = doc.selectedNodeId !== null;

  return (
    <PanelGroup direction="horizontal" style={{ height: "100%" }}>
      {/* Canvas — fills entire width when no node is selected */}
      <Panel id="canvas" order={1} defaultSize={hasSelection ? 72 : 100} minSize={55}>
        <div style={{ height: "100%", width: "100%" }}>
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
            />
          </ReactFlowProvider>
        </div>
      </Panel>

      {/* Inspector panel — only rendered when a node is selected */}
      {hasSelection ? (
        <>
          <PanelResizeHandle
            style={{
              width: RESIZE_HANDLE.size,
              background: RESIZE_HANDLE.background,
            }}
          />
          <Panel id="inspector" order={2} defaultSize={28} minSize={18} maxSize={45}>
            <NodeInspector
              flowPath={flowPath}
              flow={doc.flow}
              selectedNodeId={doc.selectedNodeId}
              onRevealYaml={handleRevealYaml}
            />
          </Panel>
        </>
      ) : null}
    </PanelGroup>
  );
}