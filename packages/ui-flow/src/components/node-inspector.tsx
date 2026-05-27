import type { CSSProperties, JSX } from "react";
import { useCallback, useMemo, useState } from "react";
import type { DataTrace, ErrorTrace } from "@agentsflow/agent-contracts";
import type { FlowDefinition, NodeDef, ParamDef, PromptAssetManifest, PromptSegment, ProviderPromptPackage } from "@agentsflow/flow-schema";
import { usePlatform } from "@agentsflow/platform-adapter";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useRuntimeStore, type PromptSourceRef } from "../store/runtime-store.js";
import { useSettingsStore } from "../store/settings-store.js";
import { BORDER, SPACING, SURFACE, TEXT, TYPO, ACCENT } from "./workbench-tokens.js";
import { getAgentDropdownItems, assemblePromptPackage } from "@agentsflow/prompt-asset-resolver";

export interface YamlRevealTarget {
  readonly scope: "node" | "agent";
  readonly targetId: string;
  readonly field?: string;
}

interface NodeInspectorProps {
  readonly flowPath: string;
  readonly flow: FlowDefinition | null;
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId?: string | null;
  readonly onRevealYaml?: (target: YamlRevealTarget) => void;
  readonly onSelectNode?: (nodeId: string) => void;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function coerceValue(param: ParamDef, raw: string, checked?: boolean): unknown {
  if (param.paramType === "boolean") {
    return Boolean(checked);
  }
  if (param.paramType === "number") {
    return raw.length === 0 ? "" : Number(raw);
  }
  if (param.paramType === "multiselect") {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (param.paramType === "json") {
    if (raw.trim().length === 0) {
      return "";
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function renderPromptSource(
  source: PromptSourceRef,
  onRevealYaml?: (target: YamlRevealTarget) => void,
): JSX.Element {
  const canReveal = onRevealYaml && source.targetId && source.field && (source.scope === "node" || source.scope === "agent");

  return (
    <button
      key={`${source.scope}:${source.targetId ?? source.label}:${source.field ?? "value"}`}
      type="button"
      onClick={() => {
        if (canReveal) {
          onRevealYaml({
            scope: source.scope,
            targetId: source.targetId!,
            field: source.field,
          });
        }
      }}
      style={{
        textAlign: "left",
        width: "100%",
        background: SURFACE.editor,
        color: TEXT.primary,
        border: `1px solid ${BORDER.default}`,
        borderRadius: 6,
        padding: `${SPACING.xs}px ${SPACING.sm}px`,
        cursor: canReveal ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>{source.label}</div>
      {source.value ? (
        <div
          style={{
            marginTop: 4,
            fontSize: TYPO.smallFontSize,
            color: TEXT.muted,
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {source.value}
        </div>
      ) : null}
    </button>
  );
}

function renderDataTrace(
  trace: DataTrace,
  direction: "input" | "output",
  flow: FlowDefinition | null,
  onSelectNode?: (nodeId: string) => void,
): JSX.Element {
  const sourceNode = flow?.graph.nodes.find((n) => n.nodeId === trace.sourceNodeId);
  const targetNode = flow?.graph.nodes.find((n) => n.nodeId === trace.targetNodeId);
  const isClickable = direction === "input"
    ? Boolean(onSelectNode) && trace.sourceNodeId !== "__global_input__"
    : Boolean(onSelectNode);
  const navigateTo = direction === "input" ? trace.sourceNodeId : trace.targetNodeId;

  const portLabel = direction === "input"
    ? `${sourceNode?.label ?? trace.sourceNodeId}:${trace.sourcePortId} → ${trace.targetPortId}`
    : `${trace.sourcePortId} → ${targetNode?.label ?? trace.targetNodeId}:${trace.targetPortId}`;

  const valuePreview = trace.value === undefined
    ? "(no value)"
    : typeof trace.value === "string"
      ? trace.value.length > 80 ? `${trace.value.slice(0, 80)}…` : trace.value
      : typeof trace.value === "object"
        ? JSON.stringify(trace.value).length > 80
          ? `${JSON.stringify(trace.value).slice(0, 80)}…`
          : JSON.stringify(trace.value)
        : String(trace.value);

  return (
    <button
      key={trace.traceId}
      type="button"
      onClick={() => {
        if (isClickable && onSelectNode && navigateTo) {
          onSelectNode(navigateTo);
        }
      }}
      style={{
        textAlign: "left",
        width: "100%",
        background: direction === "input" ? "rgba(96, 165, 250, 0.08)" : "rgba(52, 211, 153, 0.08)",
        color: TEXT.primary,
        border: `1px solid ${direction === "input" ? "rgba(96, 165, 250, 0.25)" : "rgba(52, 211, 153, 0.25)"}`,
        borderRadius: 6,
        padding: `${SPACING.xs}px ${SPACING.sm}px`,
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: TYPO.smallFontSize, color: direction === "input" ? "#60a5fa" : "#34d399", fontWeight: 500 }}>
        {direction === "input" ? "⬅" : "➡"} {portLabel}
      </div>
      <div style={{ marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
        {valuePreview}
      </div>
    </button>
  );
}

// ─── Source File Viewer ────────────────────────────────────

interface SourceFileViewerProps {
  readonly filePath: string;
  readonly content: string;
  readonly onClose: () => void;
}

function SourceFileViewer({ filePath, content, onClose }: SourceFileViewerProps): JSX.Element {
  const fileName = filePath.split("/").pop() ?? filePath;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14 }}>📄</span>
        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileName}
        </span>
        <span style={{ fontSize: 11, color: TEXT.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {filePath}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: `1px solid ${BORDER.default}`,
            borderRadius: 4,
            color: TEXT.secondary,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "2px 8px",
          }}
          title="Close"
        >
          ✕
        </button>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: SPACING.md }}>
        <pre
          style={{
            margin: 0,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: TYPO.smallFontSize,
            color: TEXT.muted,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          {content}
        </pre>
      </div>
    </div>
  );
}

function renderErrorTrace(
  errorTrace: ErrorTrace,
  onRevealYaml?: (target: YamlRevealTarget) => void,
): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        background: "rgba(248, 113, 113, 0.08)",
        border: "1px solid rgba(248, 113, 113, 0.25)",
        borderRadius: 6,
        padding: `${SPACING.xs}px ${SPACING.sm}px`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.xs,
          background: "transparent",
          border: "none",
          color: "#f87171",
          cursor: "pointer",
          fontSize: TYPO.smallFontSize,
          fontWeight: 600,
          padding: 0,
          width: "100%",
          textAlign: "left",
        }}
      >
        <span>❌</span>
        <span>{errorTrace.code}: {errorTrace.message}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: TEXT.muted }}>{errorTrace.category}</span>
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
      </button>
      {expanded ? (
        <div style={{ marginTop: 4 }}>
          {errorTrace.stack ? (
            <pre
              style={{
                margin: 0,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: TEXT.muted,
                whiteSpace: "pre-wrap",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {errorTrace.stack}
            </pre>
          ) : (
            <div style={{ fontSize: 11, color: TEXT.muted }}>No stack trace available.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function renderParamField(
  node: NodeDef,
  param: ParamDef,
  flowPath: string,
  updateNodeConfig: (flowPath: string, nodeId: string, paramId: string, value: unknown) => void,
): JSX.Element {
  const currentValue = (node.config as Record<string, unknown> | undefined)?.[param.paramId] ?? param.defaultValue;
  const commonStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: SURFACE.editor,
    color: TEXT.primary,
    border: `1px solid ${BORDER.default}`,
    borderRadius: 6,
    padding: `${SPACING.xs}px ${SPACING.sm}px`,
    fontSize: TYPO.fontSize,
  };

  if (param.paramType === "boolean") {
    return (
      <label key={param.paramId} style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
        <input
          type="checkbox"
          checked={Boolean(currentValue)}
          onChange={(event) => updateNodeConfig(flowPath, node.nodeId, param.paramId, event.currentTarget.checked)}
        />
        <span>{param.label ?? param.paramId}</span>
      </label>
    );
  }

  if (param.paramType === "select") {
    return (
      <label key={param.paramId} style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>{param.label ?? param.paramId}</span>
        <select
          value={typeof currentValue === "string" ? currentValue : String(currentValue ?? "")}
          onChange={(event) => updateNodeConfig(flowPath, node.nodeId, param.paramId, event.currentTarget.value)}
          style={commonStyle}
        >
          <option value="">请选择</option>
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label ?? option.value}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.paramType === "code" || param.paramType === "json") {
    return (
      <label key={param.paramId} style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>{param.label ?? param.paramId}</span>
        <textarea
          value={typeof currentValue === "string" ? currentValue : formatValue(currentValue)}
          onChange={(event) =>
            updateNodeConfig(
              flowPath,
              node.nodeId,
              param.paramId,
              coerceValue(param, event.currentTarget.value),
            )
          }
          rows={param.paramType === "code" ? 5 : 4}
          style={{
            ...commonStyle,
            resize: "vertical",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </label>
    );
  }

  return (
    <label key={param.paramId} style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>{param.label ?? param.paramId}</span>
      <input
        type={param.paramType === "number" ? "number" : "text"}
        value={typeof currentValue === "string" || typeof currentValue === "number" ? String(currentValue) : formatValue(currentValue)}
        onChange={(event) =>
          updateNodeConfig(
            flowPath,
            node.nodeId,
            param.paramId,
            coerceValue(param, event.currentTarget.value),
          )
        }
        style={commonStyle}
      />
    </label>
  );
}

export function NodeInspector({ flowPath, flow, selectedNodeId, selectedEdgeId, onRevealYaml, onSelectNode }: NodeInspectorProps) {
  const updateNodeConfig = useWorkspaceStore((state) => state.updateNodeConfig);
  const updateNodeAgentRef = useWorkspaceStore((state) => state.updateNodeAgentRef);
  const promptAssetManifest = useWorkspaceStore((state) => state.promptAssetManifest);
  const latestRun = useRuntimeStore((state) => state.runsByFlowPath.get(flowPath) ?? null);

  const selectedNode = flow?.graph.nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const selectedNodeState = selectedNodeId ? latestRun?.nodeStates.get(selectedNodeId) ?? null : null;

  // Find the selected edge when an edge is selected
  // React Flow edge IDs have format: edge-${source}-${target}-${index}
  const selectedEdge = selectedEdgeId
    ? flow?.graph.edges.find((edge, i) => `edge-${edge.source}-${edge.target}-${i}` === selectedEdgeId) ?? null
    : null;

  // When edge is selected, get source/target node states for I/O display
  const edgeSourceNode = selectedEdge
    ? flow?.graph.nodes.find((n) => n.nodeId === selectedEdge.source) ?? null
    : null;
  const edgeTargetNode = selectedEdge
    ? flow?.graph.nodes.find((n) => n.nodeId === selectedEdge.target) ?? null
    : null;
  const edgeSourceState = selectedEdge?.source
    ? latestRun?.nodeStates.get(selectedEdge.source) ?? null
    : null;
  const edgeTargetState = selectedEdge?.target
    ? latestRun?.nodeStates.get(selectedEdge.target) ?? null
    : null;

  // Build agent dropdown items from manifest
  const agentDropdownItems = promptAssetManifest
    ? getAgentDropdownItems(promptAssetManifest)
    : [];

  const isAgentNode = selectedNode
    ? (selectedNode.nodeKind?.startsWith("agent.") ?? false) || Boolean(selectedNode.agentId)
    : false;

  // Assemble the authoritative prompt package from the logic layer for agent nodes
  const agentPromptPackage: ProviderPromptPackage | null = useMemo(() => {
    if (!isAgentNode || !selectedNode || !promptAssetManifest) return null;

    // Resolve the agent asset from manifest using agentRef or agentId
    const agentRef = selectedNode.agentRef;
    const agentId = selectedNode.agentId;
    const resolvedAgent = agentRef
      ? promptAssetManifest.agents.get(agentRef)
      : agentId
        ? promptAssetManifest.agents.get(agentId)
        : undefined;

    if (!resolvedAgent) return null;

    // Build node config overrides from the selected node's config
    const nodeConfig = selectedNode.config as Record<string, unknown> | undefined;
    const nodeConfigOverrides = {
      ...(typeof nodeConfig?.systemPrompt === "string" && nodeConfig.systemPrompt.trim() ? { systemPrompt: nodeConfig.systemPrompt } : {}),
      ...(typeof nodeConfig?.userPrompt === "string" && nodeConfig.userPrompt.trim() ? { userPrompt: nodeConfig.userPrompt } : {}),
    };

    // Build run input from the latest run (if available)
    const runInputObj = selectedNodeState?.inputs;
    const runInput = {
      ...(typeof runInputObj?.userPrompt === "string" ? { userPrompt: runInputObj.userPrompt as string } : {}),
      ...(typeof runInputObj?.data === "string" ? { data: runInputObj.data as string } : {}),
    };

    return assemblePromptPackage(resolvedAgent, promptAssetManifest, nodeConfigOverrides, runInput);
  }, [isAgentNode, selectedNode, promptAssetManifest, selectedNodeState]);

  const [promptPreviewExpanded, setPromptPreviewExpanded] = useState(false);
  const [sourceFileViewer, setSourceFileViewer] = useState<{ readonly filePath: string; readonly content: string } | null>(null);

  const platform = usePlatform();
  const rootPath = useWorkspaceTreeStore((s) => s.rootPath);

  // Handle source file reveal — reads the file from disk and shows in viewer
  const handleRevealSourceFile = useCallback(async (filePath: string) => {
    if (!rootPath) return;
    // Resolve the path: if it starts with .agents-flow/ it's relative to workspace root
    const absolutePath = filePath.startsWith("/") ? filePath : `${rootPath}/${filePath}`;
    try {
      const result = await platform.workspace.readFile(absolutePath);
      if (result && typeof result === "object" && "content" in result) {
        setSourceFileViewer({ filePath, content: result.content });
      } else {
        setSourceFileViewer({ filePath, content: `(File not found: ${filePath})` });
      }
    } catch {
      // File may not exist on disk
      setSourceFileViewer({ filePath, content: `(Error reading file: ${filePath})` });
    }
  }, [rootPath, platform]);

  // If an edge is selected, show edge I/O inspector
  if (selectedEdgeId && selectedEdge && !selectedNodeId) {
    return (
      <div
        style={{
          height: "100%",
          background: SURFACE.sidebar,
          borderLeft: `1px solid ${BORDER.default}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflow: "auto", padding: SPACING.md, display: "grid", gap: SPACING.md }}>
          <section style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: TEXT.primary }}>Edge</div>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
              {edgeSourceNode?.label ?? selectedEdge.source} → {edgeTargetNode?.label ?? selectedEdge.target}
              {selectedEdge.sourceHandle ? ` · ${selectedEdge.sourceHandle}` : ""}
              {selectedEdge.targetHandle ? ` → ${selectedEdge.targetHandle}` : ""}
            </div>
            {selectedEdge.dataEdge && (
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>
                Data edge · {selectedEdge.sourceHandle ?? "out"} → {selectedEdge.targetHandle ?? "in"}
              </div>
            )}
          </section>

          {/* Source node output */}
          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
              Source Output
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {edgeSourceState ? (
                <>
                  {selectedEdge.sourceHandle && edgeSourceState.portOutputs[selectedEdge.sourceHandle] !== undefined ? (
                    <div style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                      <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>
                        Port: {selectedEdge.sourceHandle}
                      </div>
                      <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                        {formatValue(edgeSourceState.portOutputs[selectedEdge.sourceHandle])}
                      </div>
                    </div>
                  ) : null}
                  {edgeSourceState.finalText !== undefined ? (
                    <div style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                      <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Final Text</div>
                      <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                        {formatValue(edgeSourceState.finalText)}
                      </div>
                    </div>
                  ) : null}
                  {Object.keys(edgeSourceState.portOutputs).length > 0 && !selectedEdge.sourceHandle ? (
                    Object.entries(edgeSourceState.portOutputs).map(([portId, portValue]) => (
                      <div key={portId} style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                        <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Port: {portId}</div>
                        <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                          {formatValue(portValue)}
                        </div>
                      </div>
                    ))
                  ) : null}
                  {edgeSourceState.status === "idle" && !edgeSourceState.finalText && Object.keys(edgeSourceState.portOutputs).length === 0 ? (
                    <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>Source node has not run yet.</div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>No run data available for source node.</div>
              )}
            </div>
          </section>

          {/* Target node input */}
          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
              Target Input
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {edgeTargetState ? (
                <>
                  {selectedEdge.targetHandle && edgeTargetState.inputs[selectedEdge.targetHandle] !== undefined ? (
                    <div style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                      <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>
                        Port: {selectedEdge.targetHandle}
                      </div>
                      <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                        {formatValue(edgeTargetState.inputs[selectedEdge.targetHandle])}
                      </div>
                    </div>
                  ) : null}
                  {edgeTargetState.inputs.previousResult !== undefined ? (
                    <div style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                      <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Previous Result</div>
                      <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                        {formatValue(edgeTargetState.inputs.previousResult)}
                      </div>
                    </div>
                  ) : null}
                  {Object.keys(edgeTargetState.inputs).length > 0 && !selectedEdge.targetHandle ? (
                    Object.entries(edgeTargetState.inputs).map(([inputId, inputValue]) => (
                      <div key={inputId} style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                        <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Input: {inputId}</div>
                        <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                          {formatValue(inputValue)}
                        </div>
                      </div>
                    ))
                  ) : null}
                  {edgeTargetState.status === "idle" && Object.keys(edgeTargetState.inputs).length === 0 ? (
                    <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>Target node has not run yet.</div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>No run data available for target node.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        background: SURFACE.sidebar,
        borderLeft: `1px solid ${BORDER.default}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {!selectedNode ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: SPACING.md,
            color: TEXT.muted,
            fontSize: TYPO.fontSize,
            textAlign: "center",
          }}
        >
          选中一个节点后，可以在这里编辑参数、查看端口约束，以及预览最近一次运行的数据输入输出。
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: SPACING.md, display: "grid", gap: SPACING.md }}>
          <section style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: TEXT.primary }}>{selectedNode.label ?? selectedNode.nodeId}</div>
              {selectedNodeState?.status && selectedNodeState.status !== "idle" ? (
                <span style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  background: selectedNodeState.status === "failed" ? "rgba(248, 113, 113, 0.15)"
                    : selectedNodeState.status === "running" ? "rgba(251, 191, 36, 0.15)"
                    : selectedNodeState.status === "completed" ? "rgba(52, 211, 153, 0.15)"
                    : "rgba(96, 165, 250, 0.15)",
                  color: selectedNodeState.status === "failed" ? "#f87171"
                    : selectedNodeState.status === "running" ? "#fbbf24"
                    : selectedNodeState.status === "completed" ? "#34d399"
                    : "#60a5fa",
                }}>
                  {selectedNodeState.status}
                </span>
              ) : null}
              {selectedNodeState?.durationMs !== undefined ? (
                <span style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(96, 165, 250, 0.1)",
                  color: "#60a5fa",
                }}>
                  {selectedNodeState.durationMs >= 1000
                    ? `${(selectedNodeState.durationMs / 1000).toFixed(1)}s`
                    : `${selectedNodeState.durationMs}ms`}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
              {selectedNode.nodeKind ?? selectedNode.nodeType ?? "agent"}
              {selectedNode.agentId ? ` · ${selectedNode.agentId}` : ""}
            </div>
          </section>

          {/* Error Trace — shown when node failed */}
          {selectedNodeState?.errorTrace ? (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPO.smallFontSize, color: "#f87171", textTransform: "uppercase", letterSpacing: 1 }}>
                Error
              </div>
              {renderErrorTrace(selectedNodeState.errorTrace, onRevealYaml)}
            </section>
          ) : null}

          {/* Data Provenance — trace-level I/O with click-to-navigate source nodes */}
          {selectedNodeState && (selectedNodeState.inputTraces.length > 0 || selectedNodeState.outputTraces.length > 0) ? (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Data Provenance
              </div>
              {selectedNodeState.inputTraces.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Inputs</div>
                  {selectedNodeState.inputTraces.map((trace) => renderDataTrace(trace, "input", flow ?? null, onSelectNode))}
                </div>
              ) : null}
              {selectedNodeState.outputTraces.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, color: TEXT.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Outputs</div>
                  {selectedNodeState.outputTraces.map((trace) => renderDataTrace(trace, "output", flow ?? null, onSelectNode))}
                </div>
              ) : null}
            </section>
          ) : null}

          {isAgentNode && (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Agent Binding
              </div>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>
                  Agent Definition
                </span>
                <select
                  value={selectedNode.agentRef ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateNodeAgentRef(flowPath, selectedNode.nodeId, value.length > 0 ? value : undefined);
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: SURFACE.editor,
                    color: TEXT.primary,
                    border: `1px solid ${BORDER.default}`,
                    borderRadius: 6,
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    fontSize: TYPO.fontSize,
                  }}
                >
                  <option value="">(use agentId)</option>
                  {agentDropdownItems.map((item) => (
                    <option key={item.agentId} value={item.agentId}>
                      {item.name} ({item.outputKind}){item.hasErrors ? " ⚠" : ""}
                    </option>
                  ))}
                </select>
                {selectedNode.agentRef && promptAssetManifest?.agents.get(selectedNode.agentRef) ? (
                  <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
                    {promptAssetManifest.agents.get(selectedNode.agentRef)?.description}
                  </span>
                ) : null}
                {/* Show the .agent.md file path */}
                {selectedNode.agentMdPath && (
                  <button
                    type="button"
                    onClick={() => handleRevealSourceFile(selectedNode.agentMdPath!)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      background: SURFACE.editor,
                      border: `1px solid ${BORDER.default}`,
                      borderRadius: 4,
                      color: TEXT.muted,
                      cursor: "pointer",
                      fontSize: 11,
                      padding: `${SPACING.xs}px ${SPACING.sm}px`,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      display: "flex",
                      alignItems: "center",
                      gap: SPACING.xs,
                    }}
                  >
                    <span>📄</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedNode.agentMdPath}
                    </span>
                  </button>
                )}
              </label>
            </section>
          )}

          {/* Agent Configuration — model for agent nodes */}
          {isAgentNode && (() => {
            const modelOptions = useSettingsStore.getState().getModelOptions();
            const nodeConfig = selectedNode.config as Record<string, unknown> | undefined;
            const currentModel = typeof nodeConfig?.model === "string" ? nodeConfig.model : "";
            const resolvedOutputKind = (() => {
              if (selectedNode.agentRef && promptAssetManifest?.agents.get(selectedNode.agentRef)) {
                return promptAssetManifest.agents.get(selectedNode.agentRef)!.outputKind;
              }
              return undefined;
            })();
            const resolvedModel = (() => {
              // 1. Node-level explicit model
              if (currentModel) return { source: "node", value: currentModel };
              // 2. Agent.md model
              if (selectedNode.agentRef && promptAssetManifest?.agents.get(selectedNode.agentRef)?.model) {
                return { source: "agent.md", value: promptAssetManifest.agents.get(selectedNode.agentRef)!.model! };
              }
              // 3. Global default model
              const globalDefault = useSettingsStore.getState().defaultModelKey;
              if (globalDefault) return { source: "global", value: globalDefault };
              // No model available
              return null;
            })();
            const selectStyle: CSSProperties = {
              width: "100%",
              boxSizing: "border-box",
              background: SURFACE.editor,
              color: TEXT.primary,
              border: `1px solid ${BORDER.default}`,
              borderRadius: 6,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              fontSize: TYPO.fontSize,
            };
            return (
              <section style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Configuration
                </div>
                {/* No agentRef warning */}
                {!selectedNode.agentRef && (
                  <div style={{
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    borderRadius: 6,
                    background: "rgba(251, 191, 36, 0.1)",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    color: "#fbbf24",
                    fontSize: TYPO.smallFontSize,
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.xs,
                  }}>
                    ⚠️ 请选择 agent.md
                  </div>
                )}
                {/* Model selector */}
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>模型</span>
                  <select
                    value={currentModel}
                    onChange={(event) => updateNodeConfig(flowPath, selectedNode.nodeId, "model", event.currentTarget.value)}
                    style={selectStyle}
                  >
                    <option value="">(default)</option>
                    {modelOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {resolvedModel && resolvedModel.source !== "node" && (
                    <span style={{ fontSize: 11, color: TEXT.muted }}>
                      ↳ {resolvedModel.source === "agent.md" ? "agent.md" : "全局"}默认: {resolvedModel.value.includes("/") ? resolvedModel.value.split("/").pop() : resolvedModel.value}
                    </span>
                  )}
                </label>
                {/* No model warning — only when no models are configured at all */}
                {!resolvedModel && modelOptions.length === 0 && (
                  <div style={{
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    borderRadius: 6,
                    background: "rgba(248, 113, 113, 0.1)",
                    border: "1px solid rgba(248, 113, 113, 0.3)",
                    color: "#f87171",
                    fontSize: TYPO.smallFontSize,
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.xs,
                  }}>
                    ⚠️ 请增加全局设置
                  </div>
                )}
                {/* No model resolved but models exist — prompt to select */}
                {!resolvedModel && modelOptions.length > 0 && (
                  <div style={{
                    padding: `${SPACING.xs}px ${SPACING.sm}px`,
                    borderRadius: 6,
                    background: "rgba(251, 191, 36, 0.1)",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    color: "#fbbf24",
                    fontSize: TYPO.smallFontSize,
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.xs,
                  }}>
                    ⚠️ 请选择模型
                  </div>
                )}
                {/* Output kind — read-only, from agent.md */}
                {resolvedOutputKind && (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>输出类型</span>
                    <div style={{
                      padding: `${SPACING.xs}px ${SPACING.sm}px`,
                      borderRadius: 6,
                      background: SURFACE.editor,
                      border: `1px solid ${BORDER.default}`,
                      fontSize: TYPO.fontSize,
                      color: TEXT.muted,
                    }}>
                      {resolvedOutputKind} ← agent.md
                    </div>
                  </label>
                )}
              </section>
            );
          })()}

          {/* Prompt file list + assembled preview from logic layer */}
          {isAgentNode && agentPromptPackage && (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Prompt Files
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {agentPromptPackage.segments.length > 0 ? agentPromptPackage.segments.map((seg: PromptSegment, idx: number) => {
                  const scopeIcon: Record<string, string> = {
                    "global-system-prompt": "🌐",
                    "instruction": "📄",
                    "skill": "⚡",
                    "agent-body": "🤖",
                    "node-config": "⚙️",
                    "run-input": "💬",
                  };
                  const icon = scopeIcon[seg.scope] ?? "📝";
                  const canTrack = Boolean(seg.sourcePath);
                  return (
                    <button
                      key={`seg:${idx}:${seg.scope}:${seg.label}`}
                      type="button"
                      onClick={() => {
                        if (canTrack) {
                          handleRevealSourceFile(seg.sourcePath);
                        }
                      }}
                      style={{
                        textAlign: "left",
                        width: "100%",
                        background: SURFACE.editor,
                        color: TEXT.primary,
                        border: `1px solid ${BORDER.default}`,
                        borderRadius: 6,
                        padding: `${SPACING.xs}px ${SPACING.sm}px`,
                        cursor: canTrack ? "pointer" : "default",
                        display: "grid",
                        gap: 2,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: SPACING.xs }}>
                        <span>{icon}</span>
                        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, fontWeight: 500 }}>{seg.label}</span>
                        <span style={{
                          marginLeft: "auto",
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: seg.scope === "run-input" ? "rgba(251, 191, 36, 0.15)" : "rgba(96, 165, 250, 0.15)",
                          color: seg.scope === "run-input" ? "#fbbf24" : "#60a5fa",
                          border: `1px solid ${seg.scope === "run-input" ? "rgba(251, 191, 36, 0.3)" : "rgba(96, 165, 250, 0.3)"}`,
                        }}>
                          {seg.scope}
                        </span>
                      </div>
                      {seg.sourcePath ? (
                        <div style={{ fontSize: 11, color: TEXT.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {seg.sourcePath}
                        </div>
                      ) : null}
                      {seg.content ? (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: TYPO.smallFontSize,
                            color: TEXT.muted,
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {seg.content}
                        </div>
                      ) : null}
                    </button>
                  );
                }) : (
                  <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>当前没有加载的提示词文件。</div>
                )}
              </div>

              {/* Assembled prompt preview */}
              <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setPromptPreviewExpanded((prev) => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.xs,
                    background: "transparent",
                    border: "none",
                    color: TEXT.secondary,
                    cursor: "pointer",
                    fontSize: TYPO.smallFontSize,
                    padding: 0,
                  }}
                >
                  <span style={{ transform: promptPreviewExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>
                    ▶
                  </span>
                  <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                    Assembled Prompt Preview
                  </span>
                  <span style={{ marginLeft: 4, color: TEXT.muted }}>({agentPromptPackage.prompt.length} chars)</span>
                </button>
                {promptPreviewExpanded ? (
                  <div
                    style={{
                      padding: SPACING.sm,
                      borderRadius: 6,
                      background: SURFACE.editor,
                      border: `1px solid ${BORDER.default}`,
                      maxHeight: 300,
                      overflow: "auto",
                    }}
                  >
                    <pre style={{
                      margin: 0,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: TYPO.smallFontSize,
                      color: TEXT.muted,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {agentPromptPackage.prompt}
                    </pre>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
              Latest Output
            </div>
            <div style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                {selectedNodeState?.finalText ?? (selectedNodeState?.structuredOutput ? formatValue(selectedNodeState.structuredOutput) : "还没有运行输出")}
              </div>
            </div>
          </section>

          {/* Memory Files — per-node serialized files from .agents-flow/memory/ */}
          {selectedNodeState && selectedNodeState.memoryFilePaths && selectedNodeState.memoryFilePaths.length > 0 && (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Memory Files
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedNodeState.memoryFilePaths.map((memFile) => {
                  const fileName = memFile.split("/").pop() ?? memFile;
                  const fileIcon = fileName.endsWith(".json") ? "📋" : fileName.endsWith(".md") ? "📝" : "📄";
                  return (
                    <button
                      key={memFile}
                      type="button"
                      onClick={() => handleRevealSourceFile(memFile)}
                      style={{
                        textAlign: "left",
                        width: "100%",
                        background: SURFACE.editor,
                        color: TEXT.primary,
                        border: `1px solid ${BORDER.default}`,
                        borderRadius: 6,
                        padding: `${SPACING.xs}px ${SPACING.sm}px`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: SPACING.xs,
                      }}
                    >
                      <span>{fileIcon}</span>
                      <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, fontWeight: 500 }}>{fileName}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: TEXT.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {memFile}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
      {/* Source File Viewer Overlay */}
      {sourceFileViewer ? (
        <SourceFileViewer
          filePath={sourceFileViewer.filePath}
          content={sourceFileViewer.content}
          onClose={() => setSourceFileViewer(null)}
        />
      ) : null}
    </div>
  );
}
