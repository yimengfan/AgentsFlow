import type { AgentAdapter, AgentTurnResult, SubagentSwitchDecision, MemoryScopePolicy } from "@agentsflow/agent-contracts";
import type { FlowDefinition } from "@agentsflow/flow-schema";
import { EventBus } from "../events/event-bus.js";
import { NodeExecutor, type RunContextSnapshot } from "../executor/node-executor.js";
import { RunContext } from "../context/run-context.js";
import { SubagentArbiter } from "../arbiter/subagent-arbiter.js";

/**
 * Adapter resolver function — given an adapterKind, return the adapter instance.
 * Provided by the caller (e.g., AgentRegistry or desktop main process).
 */
export type AdapterResolver = (adapterKind: string) => AgentAdapter | undefined | Promise<AgentAdapter | undefined>;

/**
 * FlowScheduler — orchestrates the execution of a flow.
 *
 * Lifecycle:
 *   1. startRun() — create a RunContext and begin execution
 *   2. Engine walks the graph, executing nodes via NodeExecutor
 *   3. Subagent proposals are evaluated by SubagentArbiter
 *   4. Events are emitted via EventBus
 *   5. Run completes, fails, or is interrupted
 */
export class FlowScheduler {
  private eventBus: EventBus;
  private nodeExecutor: NodeExecutor;
  private arbiter: SubagentArbiter;
  private adapterResolver: AdapterResolver;
  private activeRuns: Map<string, RunContext> = new Map();

  constructor(adapterResolver: AdapterResolver) {
    this.eventBus = new EventBus();
    this.nodeExecutor = new NodeExecutor(this.eventBus);
    this.arbiter = new SubagentArbiter();
    this.adapterResolver = adapterResolver;
  }

  /** Access the event bus for subscription */
  get events(): EventBus {
    return this.eventBus;
  }

  /**
   * Start a new flow run.
   * Returns the run ID immediately; execution proceeds asynchronously.
   */
  async startRun(
    flow: FlowDefinition,
    input: Record<string, unknown> = {},
  ): Promise<string> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = new RunContext(runId, flow);
    this.activeRuns.set(runId, ctx);

    // Emit run started event
    this.eventBus.emit({
      eventType: "run_started",
      runId,
      payload: { flowName: flow.meta.name, input },
    });

    // Execute the flow asynchronously
    this.executeFlow(ctx, input).catch((error) => {
      ctx.fail();
      this.eventBus.emit({
        eventType: "run_failed",
        runId,
        payload: { error: String(error) },
      });
    });

    return runId;
  }

  /**
   * Pause a running flow.
   */
  pauseRun(runId: string): void {
    const ctx = this.activeRuns.get(runId);
    if (ctx && ctx.state === "running") {
      ctx.state = "paused";
    }
  }

  /**
   * Resume a paused flow.
   */
  resumeRun(runId: string): void {
    const ctx = this.activeRuns.get(runId);
    if (ctx && ctx.state === "paused") {
      ctx.state = "running";
    }
  }

  /**
   * Abort a running flow.
   */
  abortRun(runId: string): void {
    const ctx = this.activeRuns.get(runId);
    if (ctx) {
      ctx.state = "failed";
      ctx.completedAt = Date.now();
    }
  }

  /**
   * Get the current state of a run.
   */
  getRunState(runId: string): RunContext | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Execute the flow by walking the graph.
   */
  private async executeFlow(
    ctx: RunContext,
    input: Record<string, unknown>,
  ): Promise<void> {
    ctx.currentNodeId = ctx.getNextNodeId();

    while (ctx.currentNodeId && ctx.state === "running") {
      const node = ctx.flow.graph.nodes.find(
        (n) => n.nodeId === ctx.currentNodeId,
      );
      if (!node) {
        throw new Error(`Node "${ctx.currentNodeId}" not found in flow`);
      }

      // Skip non-agent nodes (input, output, router, etc.)
      if (node.nodeType === "agent" && node.agentId) {
        const agentDef = ctx.flow.agents.agentDefs.find(
          (a) => a.agentId === node.agentId,
        );
        if (!agentDef) {
          throw new Error(`Agent "${node.agentId}" not found for node "${node.nodeId}"`);
        }

        const adapter = await this.adapterResolver(agentDef.adapterKind);
        if (!adapter) {
          throw new Error(`Adapter "${agentDef.adapterKind}" not found`);
        }

        // Build memory policy, only including optional fields if they have values
        const memoryPolicy: MemoryScopePolicy = {
          visibleScopes: agentDef.memoryPolicy?.visibleScopes ?? ["run"],
          writableScopes: agentDef.memoryPolicy?.writableScopes ?? [],
          ...(agentDef.memoryPolicy?.maxItems !== undefined
            ? { maxItems: agentDef.memoryPolicy.maxItems }
            : {}),
          ...(agentDef.memoryPolicy?.maxBytes !== undefined
            ? { maxBytes: agentDef.memoryPolicy.maxBytes }
            : {}),
        };

        // Build context snapshot
        const snapshot: RunContextSnapshot = {
          runId: ctx.runId,
          input,
          messages: [],
          toolSurface: {
            surfaceId: `surface-${node.nodeId}`,
            allowedCapabilities: agentDef.toolPolicy?.allowedCapabilities ?? [],
            tools: [],
            policy: {
              readOnly: !agentDef.toolPolicy?.allowedCapabilities?.length,
              allowDestructive: agentDef.toolPolicy?.approvalRequirement !== "always",
              approvalRequirement: agentDef.toolPolicy?.approvalRequirement ?? "destructive_only",
            },
            invoke: async () => ({ ok: true }),
            describeForModel: () => "",
          },
          memoryPolicy,
          iteration: ctx.iteration,
        };

        // Execute the node
        const result = await this.nodeExecutor.executeNode(
          node,
          ctx.flow,
          adapter,
          snapshot,
        );

        // Handle subagent delegation proposal
        if (result.delegationProposal) {
          const decision = this.arbiter.arbitrate(
            result.delegationProposal,
            ctx.flow,
            agentDef,
          );

          this.eventBus.emit({
            eventType: "subagent_switch_resolved",
            runId: ctx.runId,
            nodeId: node.nodeId,
            agentId: node.agentId,
            invocationId: result.invocationId,
            payload: { decision },
          });
        }

        // Handle failure
        if (result.status === "failed") {
          ctx.fail();
          return;
        }
      }

      // Move to next node
      ctx.iteration++;
      ctx.currentNodeId = ctx.getNextNodeId();
    }

    // Run completed
    if (ctx.state === "running") {
      ctx.complete();
      this.eventBus.emit({
        eventType: "run_completed",
        runId: ctx.runId,
        payload: { iteration: ctx.iteration },
      });
    }
  }
}
