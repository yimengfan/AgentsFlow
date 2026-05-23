import type {
  AgentAdapter,
  AgentInvocation,
  AgentTurnResult,
  AgentEventType,
  TurnMode,
  ToolSurface,
  MemoryScopePolicy,
  StreamDeltaPayload,
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
   * @returns The turn result from the adapter
   */
  async executeNode(
    node: NodeDef,
    flow: FlowDefinition,
    adapter: AgentAdapter,
    context: RunContextSnapshot,
  ): Promise<AgentTurnResult> {
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
    const result = await adapter.runTurn(invocation);

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
        },
      });
    } else {
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
        },
      });
    }

    return result;
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
