import type { AgentAdapter, AgentTurnResult, SubagentSwitchDecision, MemoryScopePolicy, DataTrace, NodeExecutionTrace } from "@agentsflow/agent-contracts";
import type { FlowDefinition, NodeDef, PromptAssetManifest, ProviderPromptPackage } from "@agentsflow/flow-schema";
import { defaultAdapterRegistry, type ProviderAdapterRegistry } from "@agentsflow/prompt-asset-resolver";
import { EventBus } from "../events/event-bus.js";
import { NodeExecutor, type RunContextSnapshot, type NodeExecutionResult } from "../executor/node-executor.js";
import { RunContext, type EvaluateResult } from "../context/run-context.js";
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
 *   2. Engine walks the graph, executing nodes via node drivers:
 *      - Loader nodes: pass-through, propagate input data to output ports
 *      - Agent nodes: resolve adapter, execute via NodeExecutor with turnMode
 *      - Control nodes: handle plan-loop iteration, finish, etc.
 *   3. Subagent proposals are evaluated by SubagentArbiter
 *   4. Events are emitted via EventBus
 *   5. Run completes, fails, or is interrupted
 */
export class FlowScheduler {
  private eventBus: EventBus;
  private nodeExecutor: NodeExecutor;
  private arbiter: SubagentArbiter;
  private adapterResolver: AdapterResolver;
  private promptAdapterRegistry: ProviderAdapterRegistry;
  private activeRuns: Map<string, RunContext> = new Map();
  /** Resolved prompt asset manifest from .agents-flow/ (null if not loaded) */
  private promptAssetManifest: PromptAssetManifest | null = null;

  constructor(adapterResolver: AdapterResolver, promptAdapterRegistry?: ProviderAdapterRegistry) {
    this.eventBus = new EventBus();
    this.nodeExecutor = new NodeExecutor(this.eventBus);
    this.arbiter = new SubagentArbiter();
    this.adapterResolver = adapterResolver;
    this.promptAdapterRegistry = promptAdapterRegistry ?? defaultAdapterRegistry;
  }

  /** Access the event bus for subscription */
  get events(): EventBus {
    return this.eventBus;
  }

  /**
   * Set the prompt asset manifest for resolving agentRef bindings.
   * Called after scanning .agents-flow/ directory.
   */
  setPromptAssetManifest(manifest: PromptAssetManifest | null): void {
    this.promptAssetManifest = manifest;
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
    }).finally(() => {
      void this.nodeExecutor.disposeRun(runId);
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
   * Execute the flow by walking the graph with node driver dispatch.
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

      // Resolve effective node kind (nodeKind takes precedence over nodeType)
      const effectiveKind = node.nodeKind ?? node.nodeType ?? "agent";

      // Dispatch to the appropriate node driver based on kind prefix
      if (effectiveKind.startsWith("loader.")) {
        await this.executeLoaderNode(node, ctx, input);
      } else if (effectiveKind.startsWith("agent.")) {
        await this.executeAgentNode(node, ctx, input);
      } else if (effectiveKind.startsWith("control.")) {
        await this.executeControlNode(node, ctx, input);
      } else if (effectiveKind === "agent") {
        // Legacy agent nodeType
        await this.executeAgentNode(node, ctx, input);
      } else {
        // Unknown node kind — skip and move on
        this.eventBus.emit({
          eventType: "turn_completed",
          runId: ctx.runId,
          nodeId: node.nodeId,
          payload: { skipped: true, kind: effectiveKind },
        });
      }

      // If the run is no longer running, stop
      if (ctx.state !== "running") return;

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

  // ─── Loader Node Driver ─────────────────────────────────────

  /**
   * Execute a loader node — for now, pass-through.
   * Propagates input data to the "data" output port.
   */
  private async executeLoaderNode(
    node: NodeDef,
    ctx: RunContext,
    input: Record<string, unknown>,
  ): Promise<void> {
    this.eventBus.emit({
      eventType: "agent_selected",
      runId: ctx.runId,
      nodeId: node.nodeId,
      payload: { kind: node.nodeKind ?? "loader", action: "load" },
    });

    // Loader nodes pass input through to the "data" output port
    ctx.setPortValue(node.nodeId, "out", input);
    ctx.setPortValue(node.nodeId, "data", input);

    this.eventBus.emit({
      eventType: "turn_completed",
      runId: ctx.runId,
      nodeId: node.nodeId,
      payload: { kind: node.nodeKind, status: "pass-through" },
    });
  }

  // ─── Agent Node Driver ──────────────────────────────────────

  /**
   * Execute an agent node — resolve adapter, build invocation with turnMode, execute.
   * If node.agentRef is set and a promptAssetManifest is available, use the
   * prompt-asset-resolver to assemble the prompt package.
   */
  private async executeAgentNode(
    node: NodeDef,
    ctx: RunContext,
    input: Record<string, unknown>,
  ): Promise<void> {
    // Determine agentId: from node.agentId or from node config
    const agentId = node.agentId ?? (node.config as Record<string, unknown>)?.agentId as string | undefined;
    if (!agentId) {
      throw new Error(`Agent node "${node.nodeId}" has no agentId`);
    }

    const agentDef = ctx.flow.agents.agentDefs.find(
      (a) => a.agentId === agentId,
    );
    if (!agentDef) {
      throw new Error(`Agent "${agentId}" not found for node "${node.nodeId}"`);
    }

    const adapter = await this.adapterResolver(agentDef.adapterKind);
    if (!adapter) {
      throw new Error(`Adapter "${agentDef.adapterKind}" not found`);
    }

    // Determine turnMode from node config, default to "normal"
    const turnMode = (node.config as Record<string, unknown>)?.turnMode as string | undefined ?? "normal";

    // Collect input data from connected ports (data edges)
    const nodeInput = this.collectNodeInput(node, ctx, input);

    // Build upstream trace data to pass to NodeExecutor
    // Each incoming data edge produces a trace record showing provenance
    const incomingEdges = ctx.flow.graph.edges.filter(
      (e) => e.target === node.nodeId,
    );
    const upstreamTraces: Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string; value: unknown }> = [];
    for (const edge of incomingEdges) {
      if (edge.dataEdge && edge.sourceHandle && edge.targetHandle) {
        const sourceValue = ctx.getPortValue(edge.source, edge.sourceHandle);
        upstreamTraces.push({
          sourceNodeId: edge.source,
          sourcePortId: edge.sourceHandle,
          targetPortId: edge.targetHandle,
          value: sourceValue,
        });
      }
    }
    // Inject upstream traces into node input so NodeExecutor can build DataTrace records
    nodeInput._upstreamTraces = upstreamTraces;

    // Resolve prompt package via .agents-flow agentRef if available
    let promptPackage: ProviderPromptPackage | undefined;
    if (node.agentRef && this.promptAssetManifest) {
      const configOverrides: { systemPrompt?: string; userPrompt?: string } = {};
      const sys = (node.config as Record<string, unknown>)?.systemPrompt;
      const usr = (node.config as Record<string, unknown>)?.userPrompt;
      if (typeof sys === "string") configOverrides.systemPrompt = sys;
      if (typeof usr === "string") configOverrides.userPrompt = usr;

      // Build runInput for prompt assembly: the user's actual task prompt and
      // any upstream data. Data may be an object (from port propagation) —
      // serialize it so the assembler can include it in the prompt.
      const runInput: { userPrompt?: string; data?: string } = {};
      if (typeof nodeInput.userPrompt === "string" && nodeInput.userPrompt.trim().length > 0) {
        runInput.userPrompt = nodeInput.userPrompt;
      }
      if (typeof nodeInput.data === "string" && nodeInput.data.trim().length > 0) {
        runInput.data = nodeInput.data;
      } else if (nodeInput.data !== undefined && nodeInput.data !== null) {
        try {
          const serialized = JSON.stringify(nodeInput.data, null, 2);
          if (serialized.trim().length > 0) {
            runInput.data = serialized;
          }
        } catch {
          // Skip non-serializable data
        }
      }

      promptPackage = this.promptAdapterRegistry.packagePrompt(
        agentDef.adapterKind,
        node.agentRef,
        this.promptAssetManifest,
        configOverrides,
        runInput,
      );
    }

    // Build memory policy
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
      input: nodeInput,
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
      turnMode: turnMode as "normal" | "plan" | "evaluate" | "summarize",
      ...(promptPackage !== undefined ? { promptPackage } : {}),
    };

    // Execute the node
    const execResult = await this.nodeExecutor.executeNode(
      node,
      ctx.flow,
      adapter,
      snapshot,
    );
    const result = execResult.turnResult;

    // Store the result in the context
    ctx.setNodeOutput(node.nodeId, result);

    // Determine outputKind for port mapping
    const outputKind = node.agentRef
      ? (this.promptAssetManifest?.agents.get(node.agentRef)?.outputKind ?? "text")
      : (agentDef.outputKind ?? "text");

    // Propagate output to ports
    ctx.setPortValue(node.nodeId, "out", result.finalText ?? "");
    ctx.setPortValue(node.nodeId, "result", result.finalText ?? "");

    // Map output based on outputKind
    if (outputKind === "plan" && turnMode === "plan") {
      ctx.setPortValue(node.nodeId, "plan", result.structuredOutput ?? { plan: result.finalText });
    }
    if (outputKind === "score" && turnMode === "evaluate" && result.structuredOutput) {
      ctx.setPortValue(node.nodeId, "score", result.structuredOutput);
    }

    // Build output traces — which downstream nodes consume this node's output
    const outputTraces = this.buildOutputTraces(node, ctx);
    const completeTrace: NodeExecutionTrace = {
      ...execResult.trace,
      outputTraces,
    };
    ctx.setNodeTrace(node.nodeId, completeTrace);

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
        agentId,
        invocationId: result.invocationId,
        payload: { decision },
      });
    }

    // Handle failure
    if (result.status === "failed") {
      ctx.fail();
      this.eventBus.emit({
        eventType: "run_failed",
        runId: ctx.runId,
        payload: { error: result.error?.message ?? "Agent turn failed", nodeId: node.nodeId },
      });
    }
  }

  // ─── Control Node Driver ────────────────────────────────────

  /**
   * Execute a control node — dispatch by kind.
   */
  private async executeControlNode(
    node: NodeDef,
    ctx: RunContext,
    input: Record<string, unknown>,
  ): Promise<void> {
    const effectiveKind = node.nodeKind ?? "control";

    if (effectiveKind === "control.plan-loop") {
      await this.executePlanLoopNode(node, ctx, input);
    } else if (effectiveKind === "control.finish") {
      this.executeFinishNode(node, ctx);
    } else {
      // Unknown control node — skip
      this.eventBus.emit({
        eventType: "turn_completed",
        runId: ctx.runId,
        nodeId: node.nodeId,
        payload: { skipped: true, kind: effectiveKind },
      });
    }
  }

  /**
   * Execute a control.plan-loop node.
   *
   * This is the core of the plan-execute-evaluate loop:
   *   - First pass: route to "plan" output → main agent plans
   *   - After plan returns: route to "execute" output → sub agent executes
   *   - After execute returns: route to "evaluate" output → main agent evaluates
   *   - If score >= threshold: route to "done" output
   *   - If iterations < max: loop back to "execute"
   *   - Otherwise: force "done" (max iterations reached)
   */
  private async executePlanLoopNode(
    node: NodeDef,
    ctx: RunContext,
    input: Record<string, unknown>,
  ): Promise<void> {
    const config = node.config as Record<string, unknown> | undefined;
    const maxIterations = (config?.maxIterations as number | undefined) ?? 5;
    const completionThreshold = (config?.completionThreshold as number | undefined) ?? 0.8;

    // Increment loop counter
    const currentIteration = ctx.incrementLoop(node.nodeId);

    this.eventBus.emit({
      eventType: "agent_selected",
      runId: ctx.runId,
      nodeId: node.nodeId,
      payload: {
        kind: "control.plan-loop",
        iteration: currentIteration,
        maxIterations,
        completionThreshold,
      },
    });

    // Get the evaluate result from the context (set by the evaluate agent node)
    // Look at upstream nodes connected to this plan-loop's "evaluate" target edge
    const evaluateScoreData = ctx.getPortValue(node.nodeId, "score") as EvaluateResult | undefined;

    // Also check if there's an evaluation result from the evaluate agent
    // by looking at the most recent evaluate agent node output
    const evaluateResult = this.findLatestEvaluateResult(node, ctx);

    if (evaluateResult && currentIteration > 1) {
      // We have an evaluation result — decide whether to loop or finish
      const score = evaluateResult.score;
      const canComplete = evaluateResult.canComplete;

      // Set the score port value
      ctx.setPortValue(node.nodeId, "score", evaluateResult);

      if (canComplete && score >= completionThreshold) {
        // Task is complete — route to "done" output
        ctx.setActiveOutputHandle("done");
        this.eventBus.emit({
          eventType: "turn_completed",
          runId: ctx.runId,
          nodeId: node.nodeId,
          payload: {
            action: "done",
            iteration: currentIteration,
            score,
            reason: evaluateResult.reason,
          },
        });
        return;
      }

      if (currentIteration >= maxIterations) {
        // Max iterations reached — force done
        ctx.setActiveOutputHandle("done");
        this.eventBus.emit({
          eventType: "turn_completed",
          runId: ctx.runId,
          nodeId: node.nodeId,
          payload: {
            action: "done_max_iterations",
            iteration: currentIteration,
            score,
            reason: `Max iterations (${maxIterations}) reached`,
          },
        });
        return;
      }
    }

    // Determine routing based on iteration
    if (currentIteration === 1) {
      // First iteration: route to "plan" output so main agent can plan
      ctx.setActiveOutputHandle("plan");
      this.eventBus.emit({
        eventType: "turn_completed",
        runId: ctx.runId,
        nodeId: node.nodeId,
        payload: {
          action: "plan",
          iteration: currentIteration,
        },
      });
    } else {
      // Subsequent iterations: route to "execute" output
      ctx.setActiveOutputHandle("execute");
      this.eventBus.emit({
        eventType: "turn_completed",
        runId: ctx.runId,
        nodeId: node.nodeId,
        payload: {
          action: "execute",
          iteration: currentIteration,
        },
      });
    }
  }

  /**
   * Execute a control.finish node — mark the run as completed.
   */
  private executeFinishNode(
    node: NodeDef,
    ctx: RunContext,
  ): void {
    // Collect any result from the "result" input port
    const result = ctx.getPortValue(node.nodeId, "result");

    this.eventBus.emit({
      eventType: "turn_completed",
      runId: ctx.runId,
      nodeId: node.nodeId,
      payload: {
        kind: "control.finish",
        result: result ?? "Flow completed",
      },
    });

    // Complete the run
    ctx.complete();
    this.eventBus.emit({
      eventType: "run_completed",
      runId: ctx.runId,
      payload: {
        iteration: ctx.iteration,
        result: result ?? "Flow completed",
      },
    });
  }

  // ─── Helper Methods ────────────────────────────────────────

  /**
   * Collect input data for a node by looking at connected data edges
   * and port values from upstream nodes.
   */
  private collectNodeInput(
    node: NodeDef,
    ctx: RunContext,
    globalInput: Record<string, unknown>,
  ): Record<string, unknown> {
    // Preserve the global run-level userPrompt separately so it is not
    // overridden by node config.userPrompt (which is a template directive,
    // not the user's actual task input).
    const runUserPrompt = typeof globalInput.userPrompt === "string" ? globalInput.userPrompt : undefined;
    const nodeInput: Record<string, unknown> = { ...globalInput };

    // Find edges targeting this node
    const incomingEdges = ctx.flow.graph.edges.filter(
      (e) => e.target === node.nodeId,
    );

    for (const edge of incomingEdges) {
      if (edge.dataEdge && edge.sourceHandle && edge.targetHandle) {
        // Data edge: propagate port value from source to target
        const sourceValue = ctx.getPortValue(edge.source, edge.sourceHandle);
        if (sourceValue !== undefined) {
          nodeInput[edge.targetHandle] = sourceValue;
        }
      } else if (edge.source) {
        // Control flow edge: get the result from the source node if available
        const sourceOutput = ctx.getNodeOutput(edge.source);
        if (sourceOutput?.finalText !== undefined) {
          nodeInput.previousResult = sourceOutput.finalText;
        }
      }
    }

    // Also include prompt from node config if available.
    // Node config.userPrompt is a template directive — store it as
    // "configUserPrompt" so it does NOT override the run-level userPrompt.
    const config = node.config as Record<string, unknown> | undefined;
    if (config?.systemPrompt) {
      nodeInput.systemPrompt = config.systemPrompt;
    }
    if (config?.userPrompt) {
      nodeInput.configUserPrompt = config.userPrompt;
    }
    // Restore the run-level userPrompt if it was previously saved
    if (runUserPrompt !== undefined) {
      nodeInput.userPrompt = runUserPrompt;
    }

    return nodeInput;
  }

  /**
   * Find the latest EvaluateResult from the evaluate agent node
   * that feeds into this plan-loop node.
   */
  private findLatestEvaluateResult(
    node: NodeDef,
    ctx: RunContext,
  ): EvaluateResult | undefined {
    // Look for the evaluate agent output by finding all agent nodes
    // that have turnMode=evaluate and checking their stored outputs
    for (const n of ctx.flow.graph.nodes) {
      const kind = n.nodeKind ?? n.nodeType ?? "agent";
      const config = n.config as Record<string, unknown> | undefined;
      if (kind.startsWith("agent.") && config?.turnMode === "evaluate") {
        const output = ctx.getNodeOutput(n.nodeId);
        if (output?.structuredOutput) {
          const so = output.structuredOutput;
          return {
            score: (so.score as number) ?? 0,
            canComplete: (so.canComplete as boolean) ?? false,
            reason: (so.reason as string) ?? "",
          };
        }
      }
    }
    return undefined;
  }

  /**
   * Build output traces for a node — record which downstream nodes
   * consume each output port value.
   */
  private buildOutputTraces(
    node: NodeDef,
    ctx: RunContext,
  ): readonly DataTrace[] {
    const traces: DataTrace[] = [];
    const timestamp = Date.now();

    // Find outgoing edges from this node
    const outgoingEdges = ctx.flow.graph.edges.filter(
      (e) => e.source === node.nodeId,
    );

    for (const edge of outgoingEdges) {
      if (edge.dataEdge && edge.sourceHandle && edge.targetHandle) {
        const value = ctx.getPortValue(node.nodeId, edge.sourceHandle);
        traces.push({
          traceId: `trace-${ctx.runId}-${node.nodeId}-out-${edge.sourceHandle}-${edge.target}`,
          sourceNodeId: node.nodeId,
          sourcePortId: edge.sourceHandle,
          targetNodeId: edge.target,
          targetPortId: edge.targetHandle,
          value,
          timestamp,
        });
      }
    }

    return traces;
  }
}
