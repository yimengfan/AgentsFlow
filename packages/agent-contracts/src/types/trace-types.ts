/**
 * Trace types for data flow provenance and execution observability.
 *
 * These types enable developers to track where each piece of data
 * originated, how it was transformed, and where it flows next —
 * the foundation of the debug/inspection experience.
 */

/**
 * A single data trace — records the provenance of a value as it
 * moves from one node/port to another through the flow graph.
 */
export interface DataTrace {
  /** Unique trace identifier */
  readonly traceId: string;

  /** The node that produced this value */
  readonly sourceNodeId: string;

  /** The output port on the source node */
  readonly sourcePortId: string;

  /** The node that consumes this value */
  readonly targetNodeId: string;

  /** The input port on the target node */
  readonly targetPortId: string;

  /** The actual data value (may be a reference for large data) */
  readonly value: unknown;

  /** Hint about how the value was transformed (e.g. "serialized", "mapped") */
  readonly transformHint?: string;

  /** Timestamp when this trace was recorded (epoch ms) */
  readonly timestamp: number;
}

/**
 * Error trace — structured error information for a failed node execution.
 */
export interface ErrorTrace {
  /** Machine-readable error code (e.g. "adapter_timeout", "tool_execution_failed") */
  readonly code: string;

  /** Human-readable error message */
  readonly message: string;

  /** Error category for grouping (e.g. "timeout", "adapter", "tool", "runtime") */
  readonly category: string;

  /** Full stack trace if available */
  readonly stack?: string;
}

/**
 * Node execution trace — captures the complete provenance and
 * observability data for a single node execution within a flow run.
 */
export interface NodeExecutionTrace {
  /** The node that was executed */
  readonly nodeId: string;

  /** The run this trace belongs to */
  readonly runId: string;

  /** Traces for all input values — where each input came from */
  readonly inputTraces: readonly DataTrace[];

  /** Traces for all output values — where each output goes */
  readonly outputTraces: readonly DataTrace[];

  /** Prompt assembly trace — which prompt sources were assembled */
  readonly promptSources: readonly PromptTraceEntry[];

  /** Execution duration in milliseconds */
  readonly durationMs?: number;

  /** Error details if the node execution failed */
  readonly errorTrace?: ErrorTrace;

  /** Timestamp when execution started (epoch ms) */
  readonly startedAt: number;

  /** Timestamp when execution completed (epoch ms) */
  readonly completedAt?: number;
}

/**
 * A single entry in the prompt assembly trace.
 * Records which prompt source contributed to the assembled prompt,
 * in the canonical assembly order.
 */
export interface PromptTraceEntry {
  /** Label for this prompt source (e.g. "Global System Prompt", "Agent body") */
  readonly label: string;

  /** The canonical scope of this prompt source */
  readonly scope:
    | "global-system-prompt"
    | "instruction"
    | "skill"
    | "agent-body"
    | "node-config"
    | "run-input";

  /** The content that was contributed (truncated for large content) */
  readonly content?: string;

  /** File path or identifier for the source (e.g. ".agents-flow/agents/main.md") */
  readonly sourcePath?: string;

  /** Target ID for navigation (agentId, nodeId, instructionId, etc.) */
  readonly targetId?: string;

  /** Specific field on the target (e.g. "systemPrompt", "userPrompt") */
  readonly field?: string;

  /** Character length of the full content (even if content is truncated) */
  readonly contentLength?: number;
}