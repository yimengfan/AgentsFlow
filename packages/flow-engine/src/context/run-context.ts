import type { AgentEvent, InterruptHandle } from "@agentsflow/agent-contracts";
import type { FlowDefinition } from "@agentsflow/flow-schema";

/**
 * RunContext — tracks the state of a single flow run.
 *
 * Created by FlowScheduler when a run starts.
 * Updated as nodes execute, events are emitted, and
 * interrupts occur.
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

  constructor(runId: string, flow: FlowDefinition) {
    this.runId = runId;
    this.flow = flow;
    this.startedAt = Date.now();
    this.state = "running";
    this.events = [];
    this.interrupts = [];
    this.iteration = 0;
  }

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

    // For now, take the first edge (conditional routing handled later)
    return edges[0]?.target;
  }
}
