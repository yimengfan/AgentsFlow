import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import { FlowCanvas } from "./flow-canvas.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { SURFACE, RESIZE_HANDLE } from "./workbench-tokens.js";

/**
 * FlowEditorSurface — center-only editor content: canvas + YAML split.
 *
 * This is the "editor" part extracted from the old monolithic FlowEditor.
 * It reads document state from WorkspaceStore (not the legacy FlowStore)
 * and syncs edits back.
 *
 * Layout invariant: fills its parent container.
 * Must NOT set position or outer dimensions — the center panel controls that.
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

  return (
    <PanelGroup direction="vertical" style={{ height: "100%" }}>
      {/* Canvas */}
      <Panel defaultSize={60} minSize={20}>
        <div style={{ height: "100%", width: "100%" }}>
          <FlowCanvas
            flow={doc.flow}
            selectedNodeId={doc.selectedNodeId}
            onSelectNode={selectNode}
            onAddEdge={(edge) => {
              // Add edge via flow update
              if (!doc.flow) return;
              const updated = {
                ...doc.flow,
                graph: {
                  ...doc.flow.graph,
                  edges: [...doc.flow.graph.edges, edge],
                },
              };
              useWorkspaceStore.getState().updateFlow(flowPath, updated);
            }}
          />
        </div>
      </Panel>
      <PanelResizeHandle
        style={{
          height: RESIZE_HANDLE.size,
          background: RESIZE_HANDLE.background,
        }}
      />
      {/* YAML Editor */}
      <Panel defaultSize={40} minSize={15}>
        <div style={{ height: "100%", width: "100%" }}>
          {/* @ts-expect-error Monaco Editor JSX type mismatch — works at runtime */}
          <Editor
            height="100%"
            language="yaml"
            theme="vs-dark"
            value={doc.yamlSource}
            onChange={(value: string | undefined) => {
              if (value !== undefined) {
                updateYaml(flowPath, value);
              }
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
            }}
          />
        </div>
      </Panel>
    </PanelGroup>
  );
}