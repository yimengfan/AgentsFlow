import type { CSSProperties, JSX } from "react";
import { useMemo, useState } from "react";
import type { DataTrace, ErrorTrace } from "@agentsflow/agent-contracts";
import type { FlowDefinition, NodeDef, ParamDef, PromptAssetManifest, PromptSegment, ProviderPromptPackage } from "@agentsflow/flow-schema";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useRuntimeStore, type PromptSourceRef } from "../store/runtime-store.js";
import { useSettingsStore } from "../store/settings-store.js";
import { BORDER, SPACING, SURFACE, TEXT, TYPO } from "./workbench-tokens.js";
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
              </label>
            </section>
          )}

          {/* Agent Configuration — model + outputKind for agent nodes */}
          {isAgentNode && (() => {
            const modelOptions = useSettingsStore.getState().getModelOptions();
            const nodeConfig = selectedNode.config as Record<string, unknown> | undefined;
            const currentModel = typeof nodeConfig?.model === "string" ? nodeConfig.model : "";
            const currentOutputKind = typeof nodeConfig?.outputKind === "string" ? nodeConfig.outputKind : "text";
            const outputKindOptions = [
              { value: "text", label: "文本" },
              { value: "plan", label: "计划" },
              { value: "score", label: "评分" },
              { value: "code", label: "代码" },
              { value: "judge", label: "判断" },
              { value: "review", label: "审查" },
              { value: "artifact", label: "产物" },
              { value: "decision", label: "决策" },
            ];
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
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>输出类型</span>
                  <select
                    value={currentOutputKind}
                    onChange={(event) => updateNodeConfig(flowPath, selectedNode.nodeId, "outputKind", event.currentTarget.value)}
                    style={selectStyle}
                  >
                    {outputKindOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
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
                        if (canTrack && onRevealYaml) {
                          onRevealYaml({
                            scope: seg.scope === "agent-body" || seg.scope === "global-system-prompt" ? "agent" : "node",
                            targetId: seg.sourcePath,
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
        </div>
      )}
    </div>
  );
}
