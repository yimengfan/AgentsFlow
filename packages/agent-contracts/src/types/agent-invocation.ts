import type { ToolSurface } from "./tool-surface.js";
import type { MemoryScopePolicy } from "./memory-scope-policy.js";
import type { SubagentSwitchRequest } from "./subagent-switch-request.js";
import type { StreamDeltaPayload } from "./agent-event.js";

/**
 * Turn mode determines how the agent should interpret and execute this invocation.
 */
export type TurnMode =
  | "normal"
  | "plan"
  | "evaluate"
  | "summarize";

/**
 * Budget constraints for a single invocation.
 */
export interface AgentBudget {
  /** Maximum tokens (input + output combined) */
  readonly maxTokens?: number;
  /** Maximum cost in USD */
  readonly maxCostUsd?: number;
  /** Maximum number of reasoning/tool steps */
  readonly maxSteps?: number;
  /** Maximum wall-clock time in milliseconds */
  readonly maxWallClockMs?: number;
}

/**
 * A single chat message in the conversation.
 */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** For tool role: the tool call ID this message responds to */
  readonly toolCallId?: string;
  /** For assistant role with tool calls */
  readonly toolCalls?: readonly ToolCallInfo[];
}

/**
 * Minimal tool call representation for message history.
 */
export interface ToolCallInfo {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly arguments: string;
}

/**
 * AgentInvocation — the full request object sent to an adapter for a single turn.
 *
 * Contains everything the adapter needs to execute one turn:
 * identity, input, context, tools, memory, budget, and control signals.
 */
export interface AgentInvocation {
  /** Unique invocation ID */
  readonly invocationId: string;

  /** The flow run this invocation belongs to */
  readonly runId: string;

  /** The graph node that initiated this invocation */
  readonly nodeId: string;

  /** The agent definition ID to execute */
  readonly agentId: string;

  /** Target adapter kind */
  readonly adapterKind: string;

  /** Session ID (if reusing a session) */
  readonly sessionId?: string;

  /** How the agent should interpret this turn */
  readonly turnMode: TurnMode;

  /** Structured input for this turn */
  readonly input: Record<string, unknown>;

  /** Conversation message history up to this turn */
  readonly messages: readonly ChatMessage[];

  /** Resolved prompt or system/user instruction combination */
  readonly prompt?: string;

  /** Read-only context summary (flow info, iteration, workspace) */
  readonly context?: Record<string, unknown>;

  /** Tools available for this turn */
  readonly toolSurface: ToolSurface;

  /** Memory visibility policy for this turn */
  readonly memoryPolicy: MemoryScopePolicy;

  /** Subagent switching rules for this turn */
  readonly subagentPolicy?: SubagentSwitchRequest["mode"][];

  /** Budget constraints */
  readonly budget?: AgentBudget;

  /** Timeout in milliseconds */
  readonly timeoutMs?: number;

  /** Whether the adapter should stream partial results */
  readonly stream?: boolean;

  /** Callback for streaming deltas. When provided and stream=true,
   *  the adapter should call this for each incremental output chunk
   *  instead of waiting until the full result is ready. */
  readonly onStreamDelta?: (delta: StreamDeltaPayload) => void;

  /** Structured output constraint or schema reference */
  readonly expectedOutput?: {
    readonly schemaRef?: string;
    readonly schema?: Record<string, unknown>;
  };

  /** Extension metadata */
  readonly metadata?: Record<string, unknown>;
}
