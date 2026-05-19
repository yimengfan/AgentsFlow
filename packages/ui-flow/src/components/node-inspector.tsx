import type { CSSProperties, JSX } from "react";
import type { FlowDefinition, NodeDef, ParamDef } from "@agentsflow/flow-schema";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useRuntimeStore, type PromptSourceRef } from "../store/runtime-store.js";
import { BORDER, SPACING, SURFACE, TEXT, TYPO } from "./workbench-tokens.js";

export interface YamlRevealTarget {
  readonly scope: "node" | "agent";
  readonly targetId: string;
  readonly field?: string;
}

interface NodeInspectorProps {
  readonly flowPath: string;
  readonly flow: FlowDefinition | null;
  readonly selectedNodeId: string | null;
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

export function NodeInspector({ flowPath, flow, selectedNodeId, onRevealYaml }: NodeInspectorProps) {
  const updateNodeConfig = useWorkspaceStore((state) => state.updateNodeConfig);
  const latestRun = useRuntimeStore((state) => state.runsByFlowPath.get(flowPath) ?? null);

  const selectedNode = flow?.graph.nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const selectedNodeState = selectedNodeId ? latestRun?.nodeStates.get(selectedNodeId) ?? null : null;

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
