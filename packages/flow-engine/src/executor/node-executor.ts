import type {
  AgentAdapter,
  AgentInvocation,
  AgentTurnResult,
  AgentEventType,
  ToolSurface,
  MemoryScopePolicy,
} from "@agentsflow/agent-contracts";
import type { FlowDefinition, NodeDef } from "@agentsflow/flow-schema";
import type { EventBus } from "../events/event-bus.js";

/**
 * NodeExecutor — executes a single node within a flow run.
 *
 * Responsibilities:
 *   - Resolve the agent and adapter for a node
 *   - Construct the AgentInvocation from node config + runtime context
 *   - Call the adapter's runTurn
 *   - Emit events for the turn lifecycle
 *   - Handle turn results (memory writes, subagent proposals)
 */
export class NodeExecutor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Execute a single node.
   *
   * @param node - The graph node definition
   * @param flow - The full flow definition (for agent lookup)
   * @param adapter - The resolved agent adapter
   * @param context - Current run context
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

    // Build budget only if agent has budget config
    const budget = agentDef?.budgets
      ? {
          ...(agentDef.budgets.maxTokens !== undefined ? { maxTokens: agentDef.budgets.maxTokens } : {}),
          ...(agentDef.budgets.maxCostUsd !== undefined ? { maxCostUsd: agentDef.budgets.maxCostUsd } : {}),
          ...(agentDef.budgets.maxSteps !== undefined ? { maxSteps: agentDef.budgets.maxSteps } : {}),
          ...(agentDef.budgets.maxWallClockMs !== undefined ? { maxWallClockMs: agentDef.budgets.maxWallClockMs } : {}),
        }
      : undefined;

    // Build the invocation
    const invocation: AgentInvocation = {
      invocationId: `inv-${context.runId}-${node.nodeId}-${Date.now()}`,
      runId: context.runId,
      nodeId: node.nodeId,
      agentId: node.agentId ?? "",
      adapterKind: adapter.metadata.adapterKind,
      ...(context.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
      turnMode: "normal",
      input: context.input,
      messages: context.messages,
      ...(agentDef?.modelProfile?.systemPrompt !== undefined
        ? { prompt: agentDef.modelProfile.systemPrompt }
        : {}),
      toolSurface: context.toolSurface,
      memoryPolicy: context.memoryPolicy,
      ...(budget !== undefined ? { budget } : {}),
      ...(agentDef?.timeouts?.turnMs !== undefined
        ? { timeoutMs: agentDef.timeouts.turnMs }
        : {}),
      stream: false,
    };

    // Emit turn started event — only include optional fields if they have values
    this.eventBus.emit({
      eventType: "agent_selected" as AgentEventType,
      runId: context.runId,
      nodeId: node.nodeId,
      ...(node.agentId !== undefined ? { agentId: node.agentId } : {}),
      invocationId: invocation.invocationId,
      payload: { adapterKind: adapter.metadata.adapterKind },
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
          error: result.error,
        },
      });
    }

    return result;
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
}
