/**
 * Event schema version — must be included in every event for forward compatibility.
 */
export type EventSchemaVersion = "1.0";

/**
 * Agent event types — the unified event vocabulary of the platform.
 *
 * These events are emitted by the Flow Engine during execution and
 * consumed by UI, logging, monitoring, and persistence layers.
 */
export type AgentEventType =
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "agent_selected"
  | "agent_stream_delta"
  | "tool_call_started"
  | "tool_call_finished"
  | "memory_read"
  | "memory_write_proposed"
  | "memory_write_committed"
  | "subagent_switch_requested"
  | "subagent_switch_resolved"
  | "turn_completed"
  | "turn_failed"
  | "run_interrupted"
  | "run_resumed";

/**
 * AgentEvent — the universal event envelope for all platform events.
 *
 * Every event carries identity (runId, nodeId, agentId, invocationId)
 * so consumers can filter and correlate without parsing payloads.
 */
export interface AgentEvent {
  /** Unique event ID */
  readonly eventId: string;

  /** Event type discriminator */
  readonly eventType: AgentEventType;

  /** Event schema version */
  readonly schemaVersion: EventSchemaVersion;

  /** The flow run this event belongs to */
  readonly runId: string;

  /** The graph node this event originated from */
  readonly nodeId?: string;

  /** The agent this event is about */
  readonly agentId?: string;

  /** The invocation this event belongs to */
  readonly invocationId?: string;

  /** Timestamp (epoch ms) */
  readonly timestamp: number;

  /** Event-specific payload */
  readonly payload: Record<string, unknown>;

  /** Extension metadata */
  readonly metadata?: Record<string, unknown>;
}
