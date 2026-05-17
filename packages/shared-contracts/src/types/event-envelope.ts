/**
 * Event envelope for cross-process event transport.
 *
 * All runtime events are wrapped in this envelope before
 * being sent across IPC. This ensures consistent serialization
 * and version tracking.
 */
export interface EventEnvelope {
  /** Envelope schema version */
  readonly envelopeVersion: "1.0";
  /** Event type discriminator */
  readonly eventType: string;
  /** Timestamp (epoch ms) */
  readonly timestamp: number;
  /** Serialized event payload */
  readonly payload: Record<string, unknown>;
  /** Correlation ID for request-response matching */
  readonly correlationId?: string;
}
