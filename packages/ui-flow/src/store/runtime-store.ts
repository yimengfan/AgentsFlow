import { create } from "zustand";
import type { AgentEvent } from "@agentsflow/agent-contracts";
import { FlowScheduler } from "@agentsflow/flow-engine";
import type { RunContext } from "@agentsflow/flow-engine";
import type { AgentDef, FlowDefinition, NodeDef } from "@agentsflow/flow-schema";
import { resolveRuntimeAdapter } from "../lib/runtime-adapter-registry.js";

export interface PromptSourceRef {
  readonly label: string;
  readonly value?: string;
  readonly scope: "node" | "agent" | "run-input" | "external-file";
  readonly targetId?: string;
  readonly field?: string;
}

export interface NodeDebugState {
  readonly nodeId: string;
  readonly label: string;
  readonly nodeKind: string;
  readonly agentId?: string;
  readonly status: "idle" | "running" | "completed" | "failed";
  readonly inputs: Record<string, unknown>;
  readonly portOutputs: Record<string, unknown>;
  readonly finalText?: string;
  readonly structuredOutput?: Record<string, unknown>;
  readonly promptSources: readonly PromptSourceRef[];
  readonly lastEvent?: string;
}

export interface LocalRunRecord {
  readonly runId: string;
  readonly flowPath: string;
  readonly flowName: string;
  readonly state: "idle" | "running" | "paused" | "completed" | "failed" | "interrupted";
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly currentNodeId?: string;
  readonly input: Record<string, unknown>;
  readonly events: readonly AgentEvent[];
  readonly nodeStates: ReadonlyMap<string, NodeDebugState>;
  readonly finalResult?: unknown;
  readonly error?: string;
}

export interface RuntimeState {
  readonly runsByFlowPath: ReadonlyMap<string, LocalRunRecord>;
}

export interface RuntimeActions {
  startFlow: (flowPath: string, flow: FlowDefinition, input?: Record<string, unknown>) => Promise<string>;
  clearRun: (flowPath: string) => void;
}

export type RuntimeStore = RuntimeState & RuntimeActions;

const schedulerByRunId = new Map<string, FlowScheduler>();
const inputByRunId = new Map<string, Record<string, unknown>>();

function toRecord(map: ReadonlyMap<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(map.entries());
}

function buildPromptSources(
  agentDef: AgentDef | undefined,
  node: NodeDef,
  runInput: Record<string, unknown>,
): readonly PromptSourceRef[] {
  const config = node.config as Record<string, unknown> | undefined;
  const promptSources: PromptSourceRef[] = [];

  if (agentDef?.modelProfile?.systemPrompt) {
    promptSources.push({
      label: `Agent ${agentDef.agentId} / systemPrompt`,
      value: agentDef.modelProfile.systemPrompt,
      scope: "agent",
      targetId: agentDef.agentId,
      field: "systemPrompt",
    });
  }

  for (const field of ["systemPrompt", "userPrompt", "evaluatePrompt", "promptFile", "promptPath"] as const) {
    const rawValue = config?.[field];
    if (typeof rawValue !== "string" || rawValue.length === 0) {
      continue;
    }

    promptSources.push({
      label: `${node.label ?? node.nodeId} / ${field}`,
      value: rawValue,
      scope: field === "promptFile" || field === "promptPath" ? "external-file" : "node",
      targetId: node.nodeId,
      field,
    });
  }

  if (typeof runInput.userPrompt === "string" && runInput.userPrompt.length > 0) {
    promptSources.push({
      label: "Run Input / userPrompt",
      value: runInput.userPrompt,
      scope: "run-input",
    });
  }

  return promptSources;
}

function buildNodeInputs(
  flow: FlowDefinition,
  ctx: RunContext | undefined,
  node: NodeDef,
  runInput: Record<string, unknown>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = node.nodeId === flow.graph.startNodeId ? { ...runInput } : {};
  if (!ctx) {
    return inputs;
  }

  for (const edge of flow.graph.edges) {
    if (edge.target !== node.nodeId) {
      continue;
    }

    if (edge.dataEdge && edge.sourceHandle && edge.targetHandle) {
      const value = ctx.getPortValue(edge.source, edge.sourceHandle);
      if (value !== undefined) {
        inputs[edge.targetHandle] = value;
      }
      continue;
    }

    const sourceOutput = ctx.getNodeOutput(edge.source);
    if (sourceOutput?.finalText !== undefined) {
      inputs.previousResult = sourceOutput.finalText;
    }
  }

  return inputs;
}

function nextNodeStatus(current: NodeDebugState["status"], nodeId: string, event: AgentEvent): NodeDebugState["status"] {
  if (event.nodeId !== nodeId) {
    return current;
  }
  if (event.eventType === "agent_selected") {
    return "running";
  }
  if (event.eventType === "turn_completed") {
    return "completed";
  }
  if (event.eventType === "turn_failed") {
    return "failed";
  }
  return current;
}

function buildNodeStates(
  flow: FlowDefinition,
  ctx: RunContext | undefined,
  runInput: Record<string, unknown>,
  previousNodeStates: ReadonlyMap<string, NodeDebugState>,
  event: AgentEvent,
): ReadonlyMap<string, NodeDebugState> {
  const nextStates = new Map(previousNodeStates);

  for (const node of flow.graph.nodes) {
    const previous = nextStates.get(node.nodeId);
    const output = ctx?.getNodeOutput(node.nodeId);
    const agentDef = node.agentId
      ? flow.agents.agentDefs.find((agent) => agent.agentId === node.agentId)
      : undefined;
    const lastEvent = event.nodeId === node.nodeId ? event.eventType : previous?.lastEvent;

    nextStates.set(node.nodeId, {
      nodeId: node.nodeId,
      label: node.label ?? node.nodeId,
      nodeKind: node.nodeKind ?? node.nodeType ?? "agent",
      ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
      status: nextNodeStatus(previous?.status ?? "idle", node.nodeId, event),
      inputs: buildNodeInputs(flow, ctx, node, runInput),
      portOutputs: ctx ? toRecord(ctx.getNodePortValues(node.nodeId)) : {},
      ...(output?.finalText !== undefined ? { finalText: output.finalText } : {}),
      ...(output?.structuredOutput !== undefined ? { structuredOutput: output.structuredOutput } : {}),
      promptSources: buildPromptSources(agentDef, node, runInput),
      ...(lastEvent !== undefined ? { lastEvent } : {}),
    });
  }

  return nextStates;
}

function buildRunRecord(
  previous: LocalRunRecord | undefined,
  flowPath: string,
  flow: FlowDefinition,
  runInput: Record<string, unknown>,
  event: AgentEvent,
  ctx: RunContext | undefined,
): LocalRunRecord {
  const previousEvents = previous?.events ?? [];
  const previousStates = previous?.nodeStates ?? new Map<string, NodeDebugState>();
  const nextNodeStates = buildNodeStates(flow, ctx, runInput, previousStates, event);

  const stateFromContext = ctx?.state ?? previous?.state ?? "running";
  const finalNode = ctx?.currentNodeId ? nextNodeStates.get(ctx.currentNodeId) : undefined;

  return {
    runId: event.runId,
    flowPath,
    flowName: flow.meta.name,
    state: stateFromContext,
    startedAt: previous?.startedAt ?? event.timestamp,
    ...(ctx?.completedAt !== undefined ? { completedAt: ctx.completedAt } : {}),
    ...(ctx?.currentNodeId !== undefined ? { currentNodeId: ctx.currentNodeId } : {}),
    input: runInput,
    events: [...previousEvents, event],
    nodeStates: nextNodeStates,
    ...(event.eventType === "run_failed" ? { error: String(event.payload.error ?? "Run failed") } : {}),
    ...(finalNode?.finalText !== undefined ? { finalResult: finalNode.finalText } : {}),
  };
}

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  runsByFlowPath: new Map(),

  startFlow: async (flowPath, flow, input = {}) => {
    const adapterCache = new Map<string, Awaited<ReturnType<typeof resolveRuntimeAdapter>>>();
    const scheduler = new FlowScheduler(async (adapterKind) => {
      const cached = adapterCache.get(adapterKind);
      if (cached) {
        return cached;
      }

      const agentDef = flow.agents.agentDefs.find((agent) => agent.adapterKind === adapterKind);
      if (!agentDef) {
        return undefined;
      }

      const adapter = await resolveRuntimeAdapter(flow, agentDef);
      adapterCache.set(adapterKind, adapter);
      return adapter;
    });

    const unsubscribe = scheduler.events.on("*", (event) => {
      const ctx = scheduler.getRunState(event.runId);
      const runInput = inputByRunId.get(event.runId) ?? input;

      set((state) => {
        const previous = state.runsByFlowPath.get(flowPath);
        const nextRecord = buildRunRecord(previous, flowPath, flow, runInput, event, ctx);
        const nextRuns = new Map(state.runsByFlowPath);
        nextRuns.set(flowPath, nextRecord);
        return { runsByFlowPath: nextRuns };
      });

      if (event.eventType === "run_completed" || event.eventType === "run_failed") {
        unsubscribe();
        schedulerByRunId.delete(event.runId);
        inputByRunId.delete(event.runId);
      }
    });

    const runId = await scheduler.startRun(flow, input);
    schedulerByRunId.set(runId, scheduler);
    inputByRunId.set(runId, input);
    return runId;
  },

  clearRun: (flowPath) => {
    set((state) => {
      const nextRuns = new Map(state.runsByFlowPath);
      nextRuns.delete(flowPath);
      return { runsByFlowPath: nextRuns };
    });
  },
}));
