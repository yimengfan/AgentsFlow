import { create } from "zustand";
import type {
  AgentEvent,
  AgentTurnUsage,
  StreamDeltaPayload,
  ToolCallSummary,
  TurnArtifact,
} from "@agentsflow/agent-contracts";
import { FlowScheduler } from "@agentsflow/flow-engine";
import type { RunContext } from "@agentsflow/flow-engine";
import type { AgentDef, FlowDefinition, NodeDef, PromptAssetManifest, PromptSegment } from "@agentsflow/flow-schema";
import { resolveRuntimeAdapter } from "../lib/runtime-adapter-registry.js";

export interface PromptSourceRef {
  readonly label: string;
  readonly value?: string;
  readonly scope: "node" | "agent" | "run-input" | "external-file" | "global-system-prompt" | "instruction" | "skill" | "agent-body";
  readonly targetId?: string;
  readonly field?: string;
  readonly sourcePath?: string;
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
  /** Incrementally accumulated output text from stream deltas */
  readonly streamingText?: string;
  /** Incrementally accumulated reasoning text from stream deltas */
  readonly streamingReasoningText?: string;
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
  /** Incrementally accumulated output text from stream deltas (while status=running) */
  readonly streamingText?: string;
  /** Incrementally accumulated reasoning text from stream deltas */
  readonly streamingReasoningText?: string;
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
  startFlow: (flowPath: string, flow: FlowDefinition, input?: Record<string, unknown>, manifest?: PromptAssetManifest | null) => Promise<string>;
  clearRun: (flowPath: string) => void;
}

export type RuntimeStore = RuntimeState & RuntimeActions;

const schedulerByRunId = new Map<string, FlowScheduler>();
const inputByRunId = new Map<string, Record<string, unknown>>();

function toRecord(map: ReadonlyMap<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(map.entries());
}

/**
 * Map a PromptSegment scope to a PromptSourceRef scope.
 */
function segmentScopeToSourceScope(
  scope: PromptSegment["scope"],
): PromptSourceRef["scope"] {
  switch (scope) {
    case "global-system-prompt":
      return "global-system-prompt";
    case "instruction":
      return "instruction";
    case "skill":
      return "skill";
    case "agent-body":
      return "agent-body";
    case "node-config":
      return "node";
    case "run-input":
      return "run-input";
  }
}

function buildPromptSources(
  agentDef: AgentDef | undefined,
  node: NodeDef,
  runInput: Record<string, unknown>,
  manifest?: PromptAssetManifest | null,
): readonly PromptSourceRef[] {
  const promptSources: PromptSourceRef[] = [];

  // If node has an agentRef and manifest is available, produce sources from the manifest
  if (node.agentRef && manifest) {
    const agentAsset = manifest.agents.get(node.agentRef);
    if (agentAsset) {
      // Add global system prompt if present
      if (manifest.globalSystemPrompt) {
        promptSources.push({
          label: "Global System Prompt",
          value: manifest.globalSystemPrompt,
          scope: "global-system-prompt",
          sourcePath: ".agents-flow/",
        });
      }

      // Add agent body
      if (agentAsset.body) {
        promptSources.push({
          label: `${agentAsset.name} / body`,
          value: agentAsset.body,
          scope: "agent-body",
          targetId: agentAsset.agentId,
          sourcePath: agentAsset.sourcePath,
        });
      }

      // Add linked instructions (look up from manifest by ID)
      for (const instructionId of agentAsset.includes.instructions) {
        const instruction = manifest.instructions.get(instructionId);
        if (instruction) {
          promptSources.push({
            label: `Instruction: ${instruction.name}`,
            value: instruction.content,
            scope: "instruction",
            targetId: instructionId,
            sourcePath: instruction.sourcePath,
          });
        }
      }

      // Add linked skills (look up from manifest by ID)
      for (const skillId of agentAsset.includes.skills) {
        const skill = manifest.skills.get(skillId);
        if (skill) {
          promptSources.push({
            label: `Skill: ${skill.name}`,
            value: skill.content,
            scope: "skill",
            targetId: skillId,
            sourcePath: skill.sourcePath,
          });
        }
      }
    }
  }

  // Legacy: agentDef-level system prompt (only if not already covered by manifest)
  if (!node.agentRef || !manifest) {
    if (agentDef?.modelProfile?.systemPrompt) {
      promptSources.push({
        label: `Agent ${agentDef.agentId} / systemPrompt`,
        value: agentDef.modelProfile.systemPrompt,
        scope: "agent",
        targetId: agentDef.agentId,
        field: "systemPrompt",
      });
    }
  }

  const config = node.config as Record<string, unknown> | undefined;

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
  if (event.eventType === "agent_selected" || event.eventType === "agent_stream_delta") {
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
  manifest?: PromptAssetManifest | null,
): ReadonlyMap<string, NodeDebugState> {
  const nextStates = new Map(previousNodeStates);

  for (const node of flow.graph.nodes) {
    const previous = nextStates.get(node.nodeId);
    const output = ctx?.getNodeOutput(node.nodeId);
    const agentDef = node.agentId
      ? flow.agents.agentDefs.find((agent) => agent.agentId === node.agentId)
      : undefined;
    const lastEvent = event.nodeId === node.nodeId ? event.eventType : previous?.lastEvent;

    // Accumulate streaming text from stream delta events
    let streamingText = previous?.streamingText;
    let streamingReasoningText = previous?.streamingReasoningText;

    if (event.eventType === "agent_stream_delta" && event.nodeId === node.nodeId) {
      const delta = event.payload as StreamDeltaPayload;
      // Use accumulated text from delta if available, otherwise append deltaText
      if (delta.accumulatedText !== undefined) {
        streamingText = delta.accumulatedText;
      } else if (delta.deltaText) {
        streamingText = (streamingText ?? "") + delta.deltaText;
      }
      if (delta.accumulatedReasoningText !== undefined) {
        streamingReasoningText = delta.accumulatedReasoningText;
      } else if (delta.deltaReasoningText) {
        streamingReasoningText = (streamingReasoningText ?? "") + delta.deltaReasoningText;
      }
    }

    // When turn completes, clear streaming text (final text comes from output)
    if (event.eventType === "turn_completed" || event.eventType === "turn_failed") {
      if (event.nodeId === node.nodeId) {
        streamingText = undefined;
        streamingReasoningText = undefined;
      }
    }

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
      ...(streamingText !== undefined ? { streamingText } : {}),
      ...(streamingReasoningText !== undefined ? { streamingReasoningText } : {}),
      ...(output?.toolCalls !== undefined ? { toolCalls: output.toolCalls } : {}),
      ...(output?.artifacts !== undefined ? { artifacts: output.artifacts } : {}),
      ...(output?.usage !== undefined ? { usage: output.usage } : {}),
      ...(output?.warnings !== undefined ? { warnings: output.warnings } : {}),
      promptSources: buildPromptSources(agentDef, node, runInput, manifest),
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
  manifest?: PromptAssetManifest | null,
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

  // Stream delta events create or update a "running" timeline entry
  if (event.eventType === "agent_stream_delta" && event.nodeId) {
    const node = flow.graph.nodes.find((candidate) => candidate.nodeId === event.nodeId);
    if (!node) {
      return undefined;
    }

    const effectiveKind = node.nodeKind ?? node.nodeType ?? "agent";
    const isAgentNode = effectiveKind === "agent" || effectiveKind.startsWith("agent.");
    if (!isAgentNode) {
      return undefined;
    }

    const delta = event.payload as StreamDeltaPayload;
    const content = delta.accumulatedText ?? delta.deltaText ?? "";

    // Use a stable entryId based on nodeId so deltas update the same entry
    return {
      entryId: `stream-${event.runId}-${event.nodeId}`,
      role: "assistant",
      title: node.label ?? node.nodeId,
      content,
      timestamp: event.timestamp,
      ...(node.nodeId !== undefined ? { nodeId: node.nodeId } : {}),
      ...(node.nodeKind !== undefined ? { nodeKind: node.nodeKind } : {}),
      ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
      status: "running",
      streamingText: delta.accumulatedText ?? delta.deltaText ?? "",
      streamingReasoningText: delta.accumulatedReasoningText ?? delta.deltaReasoningText ?? "",
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
    const promptSources = buildPromptSources(agentDef, node, runInput, manifest);
    const content = formatTimelineContent(
      output?.finalText ?? output?.structuredOutput ?? event.payload,
      `${node.label ?? node.nodeId} completed.`,
    );
    const status = event.eventType === "turn_failed" || output?.status === "failed" ? "failed" : "completed";

    // Use the same stable entryId as the streaming entry, so the completed entry
    // replaces the streaming one rather than appearing alongside it
    const entryId = `stream-${event.runId}-${event.nodeId}`;

    return {
      entryId,
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

    // For running entries, show streaming text as content; for completed entries, show final text
    const contentForStatus =
      entry.status === "running" && nodeState.streamingText !== undefined
        ? nodeState.streamingText
        : nodeState.finalText ?? entry.content;

    return {
      ...entry,
      content: contentForStatus,
      ...(nodeState.streamingText !== undefined && entry.status === "running"
        ? { streamingText: nodeState.streamingText }
        : {}),
      ...(nodeState.streamingReasoningText !== undefined && entry.status === "running"
        ? { streamingReasoningText: nodeState.streamingReasoningText }
        : {}),
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
  manifest?: PromptAssetManifest | null,
): LocalRunRecord {
  const previousEvents = previous?.events ?? [];
  const previousStates = previous?.nodeStates ?? new Map<string, NodeDebugState>();
  const previousTimeline = previous?.timeline ?? [];
  const nextNodeStates = buildNodeStates(flow, ctx, runInput, previousStates, event, manifest);
  const timelineEntry = buildTimelineEntry(flow, ctx, runInput, event, manifest);

  // When a timeline entry with the same entryId already exists (streaming updates),
  // replace it instead of appending a duplicate.
  let nextRawTimeline: readonly RunTimelineEntry[];
  if (timelineEntry) {
    const existingIdx = previousTimeline.findIndex((e) => e.entryId === timelineEntry.entryId);
    if (existingIdx >= 0) {
      const updated = [...previousTimeline];
      updated[existingIdx] = { ...updated[existingIdx], ...timelineEntry };
      nextRawTimeline = updated;
    } else {
      nextRawTimeline = [...previousTimeline, timelineEntry];
    }
  } else {
    nextRawTimeline = previousTimeline;
  }

  const nextTimeline = hydrateTimelineEntries(nextRawTimeline, nextNodeStates);

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

  startFlow: async (flowPath, flow, input = {}, manifest?) => {
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

    // Set the prompt asset manifest on the scheduler so it can resolve agentRef bindings
    if (manifest) {
      scheduler.setPromptAssetManifest(manifest);
    }

    const unsubscribe = scheduler.events.on("*", (event) => {
      const ctx = scheduler.getRunState(event.runId);
      const runInput = inputByRunId.get(event.runId) ?? input;

      set((state) => {
        const previous = state.runsByFlowPath.get(flowPath);
        const nextRecord = buildRunRecord(previous, flowPath, flow, runInput, event, ctx, manifest);
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
