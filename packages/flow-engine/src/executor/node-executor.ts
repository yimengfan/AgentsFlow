import type {
  AgentAdapter,
  AgentInvocation,
  AgentTurnResult,
  AgentEventType,
  TurnMode,
  ToolSurface,
  MemoryScopePolicy,
  StreamDeltaPayload,
  NodeExecutionTrace,
  DataTrace,
  ErrorTrace,
  PromptTraceEntry,
} from "@agentsflow/agent-contracts";
import type { FlowDefinition, NodeDef, AgentDef, ProviderPromptPackage } from "@agentsflow/flow-schema";
import type { EventBus } from "../events/event-bus.js";

function serializePromptValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : undefined;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function joinPromptSections(sections: Array<string | undefined>): string | undefined {
  const joined = sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section && section.length > 0))
    .join("\n\n");

  return joined.length > 0 ? joined : undefined;
}

/**
 * Result of a node execution — includes both the turn result and
 * the execution trace for observability and debugging.
 */
export interface NodeExecutionResult {
  readonly turnResult: AgentTurnResult;
  readonly trace: NodeExecutionTrace;
}

/**
 * NodeExecutor — executes a single node within a flow run.
 *
 * Responsibilities:
 *   - Resolve the agent and adapter for a node
 *   - Construct the AgentInvocation from node config + runtime context
 *   - Pass turnMode from the context snapshot
 *   - Call the adapter's runTurn
 *   - Emit events for the turn lifecycle
 *   - Handle turn results (memory writes, subagent proposals)
 */
export class NodeExecutor {
  private eventBus: EventBus;
  private sessionCache: Map<string, { adapter: AgentAdapter; sessionId: string }> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Execute a single node.
   *
   * @param node - The graph node definition
   * @param flow - The full flow definition (for agent lookup)
   * @param adapter - The resolved agent adapter
   * @param context - Current run context (includes turnMode)
   * @returns The turn result along with execution trace data
   */
  async executeNode(
    node: NodeDef,
    flow: FlowDefinition,
    adapter: AgentAdapter,
    context: RunContextSnapshot,
  ): Promise<NodeExecutionResult> {
    const startedAt = Date.now();

    // Find the agent definition
    const agentDef = flow.agents.agentDefs.find((a) => a.agentId === node.agentId);
    if (!agentDef && node.agentId) {
      throw new Error(`Agent "${node.agentId}" not found in flow "${flow.meta.name}"`);
    }

    // Determine turnMode: from context snapshot (set by scheduler) or fallback to "normal"
    const turnMode: TurnMode = context.turnMode ?? "normal";
    const sessionId = await this.resolveSessionId(adapter, agentDef, context, node);

    // Build budget only if agent has budget config
    const budget = agentDef?.budgets
      ? {
          ...(agentDef.budgets.maxTokens !== undefined ? { maxTokens: agentDef.budgets.maxTokens } : {}),
          ...(agentDef.budgets.maxCostUsd !== undefined ? { maxCostUsd: agentDef.budgets.maxCostUsd } : {}),
          ...(agentDef.budgets.maxSteps !== undefined ? { maxSteps: agentDef.budgets.maxSteps } : {}),
          ...(agentDef.budgets.maxWallClockMs !== undefined ? { maxWallClockMs: agentDef.budgets.maxWallClockMs } : {}),
        }
      : undefined;

    // Resolve prompt: from node config, agent modelProfile, or context input
    const prompt = this.resolvePrompt(node, agentDef, context, turnMode);
    const metadata = this.buildInvocationMetadata(agentDef);

    // Build prompt trace entries from the prompt package or node config
    const promptTraces = this.buildPromptTraces(node, agentDef, context);

    // Build input traces from the context input
    const inputTraces = this.buildInputTraces(node, context);

    // Build the invocation
    const invocation: AgentInvocation = {
      invocationId: `inv-${context.runId}-${node.nodeId}-${Date.now()}`,
      runId: context.runId,
      nodeId: node.nodeId,
      agentId: node.agentId ?? "",
      adapterKind: adapter.metadata.adapterKind,
      ...(sessionId !== undefined ? { sessionId } : {}),
      turnMode,
      input: context.input,
      messages: context.messages,
      ...(prompt !== undefined ? { prompt } : {}),
      toolSurface: context.toolSurface,
      memoryPolicy: context.memoryPolicy,
      ...(agentDef?.subagentPolicy?.switchModes?.length
        ? { subagentPolicy: [...agentDef.subagentPolicy.switchModes] }
        : {}),
      ...(budget !== undefined ? { budget } : {}),
      ...(agentDef?.timeouts?.turnMs !== undefined
        ? { timeoutMs: agentDef.timeouts.turnMs }
        : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      stream: true,
      onStreamDelta: (delta: StreamDeltaPayload) => {
        this.eventBus.emit({
          eventType: "agent_stream_delta" as AgentEventType,
          runId: context.runId,
          nodeId: node.nodeId,
          ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
          invocationId: invocation.invocationId,
          payload: delta as unknown as Record<string, unknown>,
        });
      },
    };

    // Emit turn started event — only include optional fields if they have values
    this.eventBus.emit({
      eventType: "agent_selected" as AgentEventType,
      runId: context.runId,
      nodeId: node.nodeId,
      ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
      invocationId: invocation.invocationId,
      payload: { adapterKind: adapter.metadata.adapterKind, turnMode },
    });

    // Execute the turn
    let result: AgentTurnResult;
    let errorTrace: ErrorTrace | undefined;
    try {
      result = await adapter.runTurn(invocation);
    } catch (err: unknown) {
      const completedAt = Date.now();
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorObj: ErrorTrace = {
        code: "adapter_execution_error",
        message: errorMessage,
        category: "adapter",
        ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
      };
      // Re-throw so the scheduler can handle the failure
      // but we still want to emit the failed event with trace data
      const trace: NodeExecutionTrace = {
        nodeId: node.nodeId,
        runId: context.runId,
        inputTraces,
        outputTraces: [],
        promptSources: promptTraces,
        durationMs: completedAt - startedAt,
        errorTrace: errorObj,
        startedAt,
        completedAt,
      };
      this.eventBus.emit({
        eventType: "turn_failed" as AgentEventType,
        runId: context.runId,
        nodeId: node.nodeId,
        ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
        invocationId: invocation.invocationId,
        payload: {
          status: "failed",
          turnMode,
          error: errorMessage,
          errorTrace: errorObj,
          durationMs: completedAt - startedAt,
        },
      });
      throw err;
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    // Emit completion event
    if (result.status === "completed") {
      this.eventBus.emit({
        eventType: "turn_completed" as AgentEventType,
        runId: context.runId,
        nodeId: node.nodeId,
        ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
        invocationId: invocation.invocationId,
        payload: {
          status: result.status,
          turnMode,
          usage: result.usage,
          durationMs,
        },
      });
    } else {
      // Build error trace from result error
      if (result.error) {
        const stackVal = result.error.details?.stack as string | undefined;
        errorTrace = {
          code: result.error.code,
          message: result.error.message,
          category: result.error.category,
          ...(stackVal ? { stack: stackVal } : {}),
        };
      }
      this.eventBus.emit({
        eventType: "turn_failed" as AgentEventType,
        runId: context.runId,
        nodeId: node.nodeId,
        ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
        invocationId: invocation.invocationId,
        payload: {
          status: result.status,
          turnMode,
          error: result.error,
          ...(errorTrace ? { errorTrace } : {}),
          durationMs,
        },
      });
    }

    const trace: NodeExecutionTrace = {
      nodeId: node.nodeId,
      runId: context.runId,
      inputTraces,
      outputTraces: [], // Will be populated by the scheduler after port propagation
      promptSources: promptTraces,
      durationMs,
      ...(errorTrace ? { errorTrace } : {}),
      startedAt,
      completedAt,
    };

    return { turnResult: result, trace };
  }

  async disposeRun(runId: string): Promise<void> {
    const runPrefix = `${runId}:`;
    const matchingEntries = [...this.sessionCache.entries()].filter(([key]) => key.startsWith(runPrefix));

    await Promise.all(
      matchingEntries.map(async ([key, cached]) => {
        try {
          await cached.adapter.dispose(cached.sessionId);
        } catch {
          // Session cleanup must not mask the run result.
        } finally {
          this.sessionCache.delete(key);
        }
      }),
    );
  }

  /**
   * Resolve the prompt for an invocation based on turnMode and node config.
   * If a ProviderPromptPackage is available (from .agents-flow resolver),
   * use its assembled prompt segments instead of the legacy config-based prompt.
   */
  private resolvePrompt(
    node: NodeDef,
    agentDef: AgentDef | undefined,
    context: RunContextSnapshot,
    turnMode: TurnMode,
  ): string | undefined {
    // If a prompt package was assembled by the resolver, use it.
    // As a safety net, append the user's actual task if the assembled
    // prompt doesn't already contain it (e.g., if runInput was empty
    // during assembly but is now available in context.input).
    if (context.promptPackage) {
      const assembled = context.promptPackage.prompt;
      if (assembled && assembled.trim().length > 0) {
        const userTask = serializePromptValue(context.input.userPrompt);
        // If the user task exists and isn't already in the assembled prompt, append it
        if (userTask && !assembled.includes(userTask)) {
          return joinPromptSections([assembled, `User Task:\n${userTask}`]);
        }
        return assembled;
      }
    }

    const config = node.config as Record<string, unknown> | undefined;
    const input = context.input;
    const systemPrompt = config?.systemPrompt as string | undefined
      ?? agentDef?.modelProfile?.systemPrompt;
    const upstreamPrompt = serializePromptValue(input.prompt);
    const inputData = serializePromptValue(input.data);
    const previousResult = serializePromptValue(input.previousResult);

    // For evaluate turns, use the evaluatePrompt from the control node config
    // or from the node's own config
    if (turnMode === "evaluate") {
      const evaluatePrompt = config?.evaluatePrompt as string | undefined;
      return joinPromptSections([
        systemPrompt,
        evaluatePrompt
          ?? "Evaluate the execution result. Score from 0 to 1. Return JSON: {\"score\": <number>, \"canComplete\": <boolean>, \"reason\": \"<string>\"}",
        inputData ? `Execution Result:\n${inputData}` : undefined,
        previousResult ? `Previous Result:\n${previousResult}` : undefined,
      ]);
    }

    // For plan turns, combine the node config directive (if any) with the
    // user's actual task prompt. The config directive is a template that
    // tells the agent HOW to plan; the user prompt is WHAT to plan for.
    if (turnMode === "plan") {
      const configDirective = config?.userPrompt as string | undefined;
      const userTask = serializePromptValue(input.userPrompt) ?? upstreamPrompt;
      // Prefer the user's actual task prompt, with config directive as prefix
      const planPrompt = joinPromptSections([
        configDirective ?? undefined,
        userTask ?? "Create a plan to accomplish the given task. Return structured output.",
      ]);
      return joinPromptSections([
        systemPrompt,
        planPrompt,
        inputData ? `Context Data:\n${inputData}` : undefined,
      ]);
    }

    // For normal turns, combine config directive with user task
    const userTask = serializePromptValue(input.userPrompt) ?? upstreamPrompt;
    const configDirective = config?.userPrompt as string | undefined;
    const userPrompt = joinPromptSections([
      configDirective ?? undefined,
      userTask ?? undefined,
    ]);

    return joinPromptSections([
      systemPrompt,
      userPrompt,
      inputData ? `Additional Context:\n${inputData}` : undefined,
      !upstreamPrompt && !inputData && previousResult ? `Previous Result:\n${previousResult}` : undefined,
    ]);
  }

  private async resolveSessionId(
    adapter: AgentAdapter,
    agentDef: AgentDef | undefined,
    context: RunContextSnapshot,
    node: NodeDef,
  ): Promise<string | undefined> {
    if (context.sessionId !== undefined) {
      return context.sessionId;
    }

    const agentId = node.agentId ?? agentDef?.agentId;
    if (!agentId) {
      return undefined;
    }

    const cacheKey = `${context.runId}:${agentId}`;
    const cached = this.sessionCache.get(cacheKey);
    if (cached) {
      return cached.sessionId;
    }

    const session = await adapter.createSession({
      config: agentDef?.adapterConfig ?? {},
      runId: context.runId,
      metadata: {
        agentId,
        ...(agentDef?.modelProfile?.model !== undefined ? { model: agentDef.modelProfile.model } : {}),
      },
    });

    this.sessionCache.set(cacheKey, { adapter, sessionId: session.sessionId });
    return session.sessionId;
  }

  private buildInvocationMetadata(agentDef: AgentDef | undefined): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};

    if (agentDef?.adapterConfig !== undefined) {
      metadata.adapterConfig = agentDef.adapterConfig;
    }
    if (agentDef?.modelProfile !== undefined) {
      metadata.modelProfile = agentDef.modelProfile;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Build prompt trace entries from the prompt package or node config.
   * Records the provenance of each prompt segment in the canonical assembly order.
   */
  private buildPromptTraces(
    node: NodeDef,
    agentDef: AgentDef | undefined,
    context: RunContextSnapshot,
  ): readonly PromptTraceEntry[] {
    const entries: PromptTraceEntry[] = [];

    // If a prompt package is available, trace its segments
    if (context.promptPackage?.segments) {
      for (const segment of context.promptPackage.segments) {
        entries.push({
          label: segment.label,
          scope: segment.scope as PromptTraceEntry["scope"],
          ...(segment.content ? { content: segment.content } : {}),
          sourcePath: segment.sourcePath,
          contentLength: segment.content?.length,
        });
      }
      return entries;
    }

    // Fallback: trace from node config and agent definition
    const config = node.config as Record<string, unknown> | undefined;

    // Global system prompt from agent modelProfile
    const systemPrompt = config?.systemPrompt as string | undefined
      ?? agentDef?.modelProfile?.systemPrompt;
    if (systemPrompt) {
      entries.push({
        label: "System Prompt",
        scope: "agent-body",
        content: systemPrompt,
        ...(agentDef?.agentId ? { targetId: agentDef.agentId } : {}),
        field: "systemPrompt",
        contentLength: systemPrompt.length,
      });
    }

    // Node config userPrompt directive
    const configUserPrompt = config?.userPrompt as string | undefined;
    if (configUserPrompt) {
      entries.push({
        label: "Config Directive",
        scope: "node-config",
        content: configUserPrompt,
        targetId: node.nodeId,
        field: "userPrompt",
        contentLength: configUserPrompt.length,
      });
    }

    // Run-level user prompt
    const runUserPrompt = context.input.userPrompt as string | undefined;
    if (runUserPrompt) {
      entries.push({
        label: "Run Input",
        scope: "run-input",
        content: runUserPrompt,
        contentLength: runUserPrompt.length,
      });
    }

    // Upstream data
    const data = context.input.data;
    if (data !== undefined && data !== null) {
      const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      entries.push({
        label: "Upstream Data",
        scope: "run-input",
        content: dataStr,
        contentLength: dataStr?.length,
      });
    }

    return entries;
  }

  /**
   * Build input traces from the context input.
   * Each key-value pair in context.input becomes a DataTrace entry.
   */
  private buildInputTraces(
    node: NodeDef,
    context: RunContextSnapshot,
  ): readonly DataTrace[] {
    const traces: DataTrace[] = [];
    const input = context.input;
    const timestamp = Date.now();

    // Check if input has upstream trace data injected by the scheduler
    const upstreamTraces = input._upstreamTraces as Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string; value: unknown }> | undefined;

    if (upstreamTraces) {
      for (const ut of upstreamTraces) {
        traces.push({
          traceId: `trace-${context.runId}-${node.nodeId}-in-${ut.sourceNodeId}-${ut.sourcePortId}`,
          sourceNodeId: ut.sourceNodeId,
          sourcePortId: ut.sourcePortId,
          targetNodeId: node.nodeId,
          targetPortId: ut.targetPortId,
          value: ut.value,
          timestamp,
        });
      }
    } else {
      // Fallback: trace each input key as coming from an unknown source
      for (const [key, value] of Object.entries(input)) {
        if (key === "_upstreamTraces") continue;
        traces.push({
          traceId: `trace-${context.runId}-${node.nodeId}-in-${key}`,
          sourceNodeId: "__global_input__",
          sourcePortId: key,
          targetNodeId: node.nodeId,
          targetPortId: key,
          value,
          timestamp,
        });
      }
    }

    return traces;
  }
}

/**
 * Snapshot of the current run context, passed to NodeExecutor.
 */
export interface RunContextSnapshot {
  readonly runId: string;
  readonly sessionId?: string;
  readonly input: Record<string, unknown>;
  readonly messages: AgentInvocation["messages"];
  readonly toolSurface: ToolSurface;
  readonly memoryPolicy: MemoryScopePolicy;
  readonly iteration?: number;
  /** Turn mode for this execution (plan/evaluate/normal/summarize) */
  readonly turnMode?: TurnMode;
  /** Assembled prompt package from .agents-flow resolver (takes priority over legacy prompt) */
  readonly promptPackage?: ProviderPromptPackage;
}
