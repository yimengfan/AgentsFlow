import type { CSSProperties, JSX } from "react";
import { useMemo, useState } from "react";
import type { FlowDefinition, NodeDef, ParamDef, PromptAssetManifest, PromptSegment, ProviderPromptPackage } from "@agentsflow/flow-schema";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useRuntimeStore, type PromptSourceRef } from "../store/runtime-store.js";
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

export function NodeInspector({ flowPath, flow, selectedNodeId, selectedEdgeId, onRevealYaml }: NodeInspectorProps) {
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
            <div style={{ fontSize: 18, fontWeight: 600, color: TEXT.primary }}>{selectedNode.label ?? selectedNode.nodeId}</div>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
              {selectedNode.nodeKind ?? selectedNode.nodeType ?? "agent"}
              {selectedNode.agentId ? ` · ${selectedNode.agentId}` : ""}
              {selectedNodeState ? ` · ${selectedNodeState.status}` : ""}
            </div>
          </section>

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
              Ports
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {selectedNode.inputPorts.map((port) => (
                <div key={`in:${port.portId}`} style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                  <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Input · {port.label ?? port.portId} · {port.dataType}</div>
                  <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                    {formatValue(selectedNodeState?.inputs[port.portId])}
                  </div>
                </div>
              ))}
              {selectedNode.outputPorts.map((port) => (
                <div key={`out:${port.portId}`} style={{ padding: SPACING.sm, borderRadius: 6, background: SURFACE.editor, border: `1px solid ${BORDER.default}` }}>
                  <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary }}>Output · {port.label ?? port.portId} · {port.dataType}</div>
                  <div style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TYPO.smallFontSize, color: TEXT.muted, whiteSpace: "pre-wrap" }}>
                    {formatValue(selectedNodeState?.portOutputs[port.portId])}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
              Parameters
            </div>
            <div style={{ display: "grid", gap: SPACING.sm }}>
              {selectedNode.params.length > 0 ? selectedNode.params.map((param) => renderParamField(selectedNode, param, flowPath, updateNodeConfig)) : (
                <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>该节点没有可编辑参数。</div>
              )}
            </div>
          </section>

          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.secondary, textTransform: "uppercase", letterSpacing: 1 }}>
              Prompt Sources
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {selectedNodeState?.promptSources.length ? selectedNodeState.promptSources.map((source) => renderPromptSource(source, onRevealYaml)) : (
                <div style={{ color: TEXT.muted, fontSize: TYPO.smallFontSize }}>当前没有可用的提示词源。</div>
              )}
            </div>
          </section>

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
