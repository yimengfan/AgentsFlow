import type { AgentEvent, AgentTurnResult, InterruptHandle } from "@agentsflow/agent-contracts";
import type { FlowDefinition } from "@agentsflow/flow-schema";

/**
 * Evaluation result from an evaluate turn.
 * Used by control.plan-loop to decide whether to loop or finish.
 */
export interface EvaluateResult {
  /** Score from 0 to 1 */
  readonly score: number;
  /** Whether the task can be considered complete */
  readonly canComplete: boolean;
  /** Human-readable reason for the score */
  readonly reason: string;
}

/**
 * RunContext — tracks the state of a single flow run.
 *
 * Created by FlowScheduler when a run starts.
 * Updated as nodes execute, events are emitted, and
 * interrupts occur.
 *
 * Port value store: nodeId → portId → value
 * Node outputs: nodeId → AgentTurnResult
 * Loop counters: loopNodeId → iteration count
 */
export class RunContext {
  readonly runId: string;
  readonly flow: FlowDefinition;
  readonly startedAt: number;

  state: "running" | "paused" | "completed" | "failed" | "interrupted";
  currentNodeId: string | undefined;
  completedAt?: number;
  events: AgentEvent[];
  interrupts: InterruptHandle[];
  iteration: number;

  /** Port value store: nodeId → portId → value */
  private portValues: Map<string, Map<string, unknown>> = new Map();
  /** Node execution outputs: nodeId → AgentTurnResult */
  private nodeOutputs: Map<string, AgentTurnResult> = new Map();
  /** Loop counters: loopNodeId → current iteration (1-based) */
  private loopCounters: Map<string, number> = new Map();
  /** Which output handle was activated for the current node (for conditional routing) */
  private activeOutputHandle: string | undefined;

  constructor(runId: string, flow: FlowDefinition) {
    this.runId = runId;
    this.flow = flow;
    this.startedAt = Date.now();
    this.state = "running";
    this.events = [];
    this.interrupts = [];
    this.iteration = 0;
  }

  // ─── Port Value Store ──────────────────────────────────────

  /** Set a port value for a specific node and port */
  setPortValue(nodeId: string, portId: string, value: unknown): void {
    let nodePorts = this.portValues.get(nodeId);
    if (!nodePorts) {
      nodePorts = new Map();
      this.portValues.set(nodeId, nodePorts);
    }
    nodePorts.set(portId, value);
  }

  /** Get a port value for a specific node and port */
  getPortValue(nodeId: string, portId: string): unknown {
    return this.portValues.get(nodeId)?.get(portId);
  }

  /** Get all port values for a node */
  getNodePortValues(nodeId: string): ReadonlyMap<string, unknown> {
    return this.portValues.get(nodeId) ?? new Map();
  }

  // ─── Node Output Store ──────────────────────────────────────

  /** Store the execution result for a node */
  setNodeOutput(nodeId: string, result: AgentTurnResult): void {
    this.nodeOutputs.set(nodeId, result);
  }

  /** Get the execution result for a node */
  getNodeOutput(nodeId: string): AgentTurnResult | undefined {
    return this.nodeOutputs.get(nodeId);
  }

  // ─── Loop Counter Store ──────────────────────────────────────

  /** Increment the loop counter for a loop node, return new count */
  incrementLoop(loopNodeId: string): number {
    const current = this.loopCounters.get(loopNodeId) ?? 0;
    const next = current + 1;
    this.loopCounters.set(loopNodeId, next);
    return next;
  }

  /** Get the current loop iteration for a loop node (0 if not started) */
  getLoopCount(loopNodeId: string): number {
    return this.loopCounters.get(loopNodeId) ?? 0;
  }

  /** Reset the loop counter for a loop node */
  resetLoop(loopNodeId: string): void {
    this.loopCounters.set(loopNodeId, 0);
  }

  // ─── Active Output Handle ──────────────────────────────────────

  /** Set which output handle was activated for the current node */
  setActiveOutputHandle(handle: string | undefined): void {
    this.activeOutputHandle = handle;
  }

  /** Get the active output handle */
  getActiveOutputHandle(): string | undefined {
    return this.activeOutputHandle;
  }

  // ─── Event / Interrupt Management ──────────────────────────────

  /**
   * Record an event in this run's history.
   */
  recordEvent(event: AgentEvent): void {
    this.events.push(event);
  }

  /**
   * Add an interrupt handle.
   */
  addInterrupt(handle: InterruptHandle): void {
    this.interrupts.push(handle);
    this.state = "interrupted";
  }

  /**
   * Clear an interrupt and return to running state.
   */
  clearInterrupt(resumeToken: string): boolean {
    const idx = this.interrupts.findIndex((i) => i.resumeToken === resumeToken);
    if (idx === -1) return false;
    this.interrupts.splice(idx, 1);
    if (this.interrupts.length === 0) {
      this.state = "running";
    }
    return true;
  }

  /**
   * Mark the run as completed.
   */
  complete(): void {
    this.state = "completed";
    this.completedAt = Date.now();
  }

  /**
   * Mark the run as failed.
   */
  fail(): void {
    this.state = "failed";
    this.completedAt = Date.now();
  }

  /**
   * Get the next node to execute based on the graph edges.
   * Supports conditional routing via sourceHandle matching.
   */
  getNextNodeId(): string | undefined {
    if (!this.currentNodeId) {
      return this.flow.graph.startNodeId;
    }

    // Find edges from the current node
    const edges = this.flow.graph.edges.filter(
      (e) => e.source === this.currentNodeId,
    );

    if (edges.length === 0) return undefined;

    // If there's an active output handle, try to match it
    if (this.activeOutputHandle) {
      const matchingEdge = edges.find(
        (e) => e.sourceHandle === this.activeOutputHandle,
      );
      if (matchingEdge) {
        this.activeOutputHandle = undefined; // Clear after use
        return matchingEdge.target;
      }
    }

    // Fallback: take the first edge without a sourceHandle,
    // or the first edge if none have sourceHandles
    const defaultEdge = edges.find((e) => !e.sourceHandle) ?? edges[0];
    this.activeOutputHandle = undefined;
    return defaultEdge?.target;
  }
}
