import { create } from "zustand";
import type {
  AgentEvent,
  AgentTurnUsage,
  ToolCallSummary,
  TurnArtifact,
} from "@agentsflow/agent-contracts";
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
  readonly reasoningText?: string;
  readonly toolCalls?: readonly ToolCallSummary[];
  readonly artifacts?: readonly TurnArtifact[];
  readonly usage?: AgentTurnUsage;
  readonly warnings?: readonly string[];
  readonly promptSources: readonly PromptSourceRef[];
  readonly lastEvent?: string;
}

export interface RunTimelineEntry {
  readonly entryId: string;
  readonly role: "user" | "assistant" | "system";
  readonly title: string;
  readonly content: string;
  readonly timestamp: number;
  readonly nodeId?: string;
  readonly nodeKind?: string;
  readonly agentId?: string;
  readonly status?: "completed" | "failed" | "running";
  readonly inputs?: Record<string, unknown>;
  readonly promptSources?: readonly PromptSourceRef[];
  readonly structuredOutput?: Record<string, unknown>;
  readonly reasoningText?: string;
  readonly toolCalls?: readonly ToolCallSummary[];
  readonly artifacts?: readonly TurnArtifact[];
  readonly usage?: AgentTurnUsage;
  readonly warnings?: readonly string[];
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
  readonly timeline: readonly RunTimelineEntry[];
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
      ...(output?.reasoningText !== undefined ? { reasoningText: output.reasoningText } : {}),
      ...(output?.toolCalls !== undefined ? { toolCalls: output.toolCalls } : {}),
      ...(output?.artifacts !== undefined ? { artifacts: output.artifacts } : {}),
      ...(output?.usage !== undefined ? { usage: output.usage } : {}),
      ...(output?.warnings !== undefined ? { warnings: output.warnings } : {}),
      promptSources: buildPromptSources(agentDef, node, runInput),
      ...(lastEvent !== undefined ? { lastEvent } : {}),
    });
  }

  return nextStates;
}

function formatTimelineContent(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (value !== undefined) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return fallback;
}

function buildTimelineEntry(
  flow: FlowDefinition,
  ctx: RunContext | undefined,
  runInput: Record<string, unknown>,
  event: AgentEvent,
): RunTimelineEntry | undefined {
  if (event.eventType === "run_started") {
    const content = formatTimelineContent(
      runInput.userPrompt ?? (Object.keys(runInput).length > 0 ? runInput : undefined),
      "Started flow run.",
    );
    return {
      entryId: event.eventId,
      role: "user",
      title: "User",
      content,
      timestamp: event.timestamp,
      status: "running",
    };
  }

  if ((event.eventType === "turn_completed" || event.eventType === "turn_failed") && event.nodeId) {
    const node = flow.graph.nodes.find((candidate) => candidate.nodeId === event.nodeId);
    if (!node) {
      return undefined;
    }

    const effectiveKind = node.nodeKind ?? node.nodeType ?? "agent";
    const isAgentNode = effectiveKind === "agent" || effectiveKind.startsWith("agent.");
    if (!isAgentNode) {
      return undefined;
    }

    const output = ctx?.getNodeOutput(node.nodeId);
    const agentDef = node.agentId
      ? flow.agents.agentDefs.find((agent) => agent.agentId === node.agentId)
      : undefined;
    const inputs = buildNodeInputs(flow, ctx, node, runInput);
    const promptSources = buildPromptSources(agentDef, node, runInput);
    const content = formatTimelineContent(
      output?.finalText ?? output?.structuredOutput ?? event.payload,
      `${node.label ?? node.nodeId} completed.`,
    );
    const status = event.eventType === "turn_failed" || output?.status === "failed" ? "failed" : "completed";

    return {
      entryId: event.eventId,
      role: "assistant",
      title: node.label ?? node.nodeId,
      content,
      timestamp: event.timestamp,
      ...(node.nodeId !== undefined ? { nodeId: node.nodeId } : {}),
      ...(node.nodeKind !== undefined ? { nodeKind: node.nodeKind } : {}),
      ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
      status,
      ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
      ...(promptSources.length > 0 ? { promptSources } : {}),
      ...(output?.structuredOutput !== undefined ? { structuredOutput: output.structuredOutput } : {}),
      ...(output?.reasoningText !== undefined ? { reasoningText: output.reasoningText } : {}),
      ...(output?.toolCalls !== undefined ? { toolCalls: output.toolCalls } : {}),
      ...(output?.artifacts !== undefined ? { artifacts: output.artifacts } : {}),
      ...(output?.usage !== undefined ? { usage: output.usage } : {}),
      ...(output?.warnings !== undefined ? { warnings: output.warnings } : {}),
    };
  }

  if (event.eventType === "run_failed") {
    return {
      entryId: event.eventId,
      role: "system",
      title: "Run Failed",
      content: formatTimelineContent(event.payload.error, "Run failed."),
      timestamp: event.timestamp,
      status: "failed",
    };
  }

  return undefined;
}

function hydrateTimelineEntries(
  timeline: readonly RunTimelineEntry[],
  nodeStates: ReadonlyMap<string, NodeDebugState>,
): readonly RunTimelineEntry[] {
  return timeline.map((entry) => {
    if (!entry.nodeId) {
      return entry;
    }

    const nodeState = nodeStates.get(entry.nodeId);
    if (!nodeState) {
      return entry;
    }

    return {
      ...entry,
      content: nodeState.finalText ?? entry.content,
      ...(nodeState.structuredOutput !== undefined ? { structuredOutput: nodeState.structuredOutput } : {}),
      ...(nodeState.reasoningText !== undefined ? { reasoningText: nodeState.reasoningText } : {}),
      ...(nodeState.toolCalls !== undefined ? { toolCalls: nodeState.toolCalls } : {}),
      ...(nodeState.artifacts !== undefined ? { artifacts: nodeState.artifacts } : {}),
      ...(nodeState.usage !== undefined ? { usage: nodeState.usage } : {}),
      ...(nodeState.warnings !== undefined ? { warnings: nodeState.warnings } : {}),
    };
  });
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
  const previousTimeline = previous?.timeline ?? [];
  const nextNodeStates = buildNodeStates(flow, ctx, runInput, previousStates, event);
  const timelineEntry = buildTimelineEntry(flow, ctx, runInput, event);
  const nextTimeline = hydrateTimelineEntries(
    timelineEntry ? [...previousTimeline, timelineEntry] : previousTimeline,
    nextNodeStates,
  );

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
    timeline: nextTimeline,
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
