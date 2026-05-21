import type { AgentCapability } from "./agent-adapter-metadata.js";
import type { SubagentSwitchRequest } from "./subagent-switch-request.js";
import type { MemoryWrite } from "./memory-write.js";

/**
 * Final status of an agent turn.
 */
export type AgentTurnStatus =
  | "completed"
  | "failed"
  | "interrupted"
  | "timed_out"
  | "blocked";

/**
 * Structured error information when a turn fails.
 */
export interface AgentTurnError {
  /** Machine-readable error code */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** Error category for routing */
  readonly category: "adapter" | "model" | "tool" | "budget" | "platform" | "unknown";
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Original error details from the adapter (for debugging only, not for UI) */
  readonly details?: Record<string, unknown>;
}

/**
 * Token/cost/duration usage statistics for a turn.
 */
export interface AgentTurnUsage {
  /** Input tokens consumed */
  readonly inputTokens?: number;
  /** Output tokens generated */
  readonly outputTokens?: number;
  /** Total tokens */
  readonly totalTokens?: number;
  /** Estimated cost in USD */
  readonly costUsd?: number;
  /** Duration in milliseconds */
  readonly durationMs?: number;
  /** Number of reasoning/tool steps taken */
  readonly steps?: number;
}

/**
 * Summary of a tool call that occurred during a turn.
 */
export interface ToolCallSummary {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "success" | "failed" | "pending_approval";
  readonly durationMs?: number;
}

/**
 * Artifact produced by a turn.
 */
export interface TurnArtifact {
  readonly artifactId: string;
  readonly artifactType: string;
  readonly path?: string;
  readonly description?: string;
}

/**
 * AgentTurnResult — the outcome of a single agent turn.
 *
 * This is the primary output contract. All fields are optional except
 * invocationId and status — adapters fill in what they can.
 */
export interface AgentTurnResult {
  /** The invocation this result corresponds to */
  readonly invocationId: string;

  /** Final status of the turn */
  readonly status: AgentTurnStatus;

  /** Final text output from the agent */
  readonly finalText?: string;

  /** Structured output (if expectedOutput was specified and produced) */
  readonly structuredOutput?: Record<string, unknown>;

  /** Optional reasoning or chain-of-thought style trace supplied by the adapter. */
  readonly reasoningText?: string;

  /** Tool calls that occurred during this turn */
  readonly toolCalls?: readonly ToolCallSummary[];

  /** Memory write proposals (platform must approve before committing) */
  readonly memoryWrites?: readonly MemoryWrite[];

  /** Optional subagent delegation proposal */
  readonly delegationProposal?: SubagentSwitchRequest;

  /** Usage statistics */
  readonly usage?: AgentTurnUsage;

  /** Artifacts produced during this turn */
  readonly artifacts?: readonly TurnArtifact[];

  /** Non-fatal warnings */
  readonly warnings?: readonly string[];

  /** Structured error (present only when status is "failed") */
  readonly error?: AgentTurnError;

  /**
   * Reference to raw adapter payload for debugging/archival.
   * NOT to be consumed by UI or Engine — contracts boundary only.
   */
  readonly rawAdapterPayloadRef?: string;

  /** Capabilities that were actually used during this turn */
  readonly usedCapabilities?: readonly AgentCapability[];
}
