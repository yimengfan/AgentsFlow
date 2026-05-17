import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import { FlowCanvas } from "./flow-canvas.js";
import { useFlowStore } from "../store/flow-store.js";

/**
 * FlowEditor — LEGACY monolithic layout component.
 *
 * DEPRECATED: Use <Workbench> for the new VS Code-like layout.
 * This component is kept for backward compatibility and standalone use.
 *
 * It still uses the legacy useFlowStore (single-document state).
 * FlowCanvas now accepts props, so we pass them from the store.
 */
export function FlowEditor() {
  const flow = useFlowStore((s) => s.flow);
  const yamlSource = useFlowStore((s) => s.yamlSource);
  const updateYaml = useFlowStore((s) => s.updateYaml);
  const validationErrors = useFlowStore((s) => s.validationErrors);
  const isDirty = useFlowStore((s) => s.isDirty);
  const selectNode = useFlowStore((s) => s.selectNode);
  const addEdge = useFlowStore((s) => s.addEdge);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          background: "#1e1e2e",
          borderBottom: "1px solid #333",
          fontSize: 13,
          color: "#e0e0e0",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {flow?.meta?.name ?? "Untitled Flow"}
        </span>
        {isDirty && <span style={{ color: "#f59e0b" }}>●</span>}
        {validationErrors.length > 0 && (
          <span style={{ color: "#ef4444", fontSize: 11 }}>
            {validationErrors.length} error{validationErrors.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Main content */}
      <PanelGroup direction="horizontal" style={{ flex: 1 }}>
        {/* Left: Canvas + YAML */}
        <Panel defaultSize={60} minSize={30}>
          <PanelGroup direction="vertical">
            {/* Canvas */}
            <Panel defaultSize={60} minSize={20}>
              <div style={{ height: "100%", width: "100%" }}>
                <FlowCanvas
                  flow={flow}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={selectNode}
                  onAddEdge={addEdge}
                />
              </div>
            </Panel>
            <PanelResizeHandle style={{ height: 4, background: "#333" }} />
            {/* YAML Editor */}
            <Panel defaultSize={40} minSize={15}>
              <div style={{ height: "100%", width: "100%" }}>
                {/* @ts-expect-error Monaco Editor JSX type mismatch — works at runtime */}
                <Editor
                  height="100%"
                  language="yaml"
                  theme="vs-dark"
                  value={yamlSource}
                  onChange={(value: string | undefined) => {
                    if (value !== undefined) {
                      updateYaml(value);
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
        </Panel>

        <PanelResizeHandle style={{ width: 4, background: "#333" }} />

        {/* Right: Chat / Monitor */}
        <Panel defaultSize={40} minSize={20}>
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: "#1e1e2e",
              color: "#e0e0e0",
            }}
          >
            {/* Chat header */}
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid #333",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Run Monitor
            </div>

            {/* Event log */}
            <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
              {flow ? (
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  <div>Flow: {flow.meta.name}</div>
                  <div>Agents: {flow.agents.agentDefs.length}</div>
                  <div>Nodes: {flow.graph.nodes.length}</div>
                  <div>Edges: {flow.graph.edges.length}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Load a flow to see run events
                </div>
              )}
            </div>

            {/* Input area */}
            <div style={{ padding: 8, borderTop: "1px solid #333" }}>
              <input
                type="text"
                placeholder="Send a message to the agent..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#2d2d3f",
                  color: "#e0e0e0",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
