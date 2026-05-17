import type { AgentAdapterMetadata, AgentCapability } from "./agent-adapter-metadata.js";
import type { AgentInvocation } from "./agent-invocation.js";
import type { AgentTurnResult } from "./agent-turn-result.js";
import type { InterruptHandle } from "./interrupt-handle.js";

/**
 * Session handle returned by createSession.
 * Represents a reusable or one-shot agent session.
 */
export interface AgentSession {
  /** Unique session identifier */
  readonly sessionId: string;
  /** The adapter kind that created this session */
  readonly adapterKind: string;
}

/**
 * AgentAdapter — the primary contract between the platform and any agent backend.
 *
 * Lifecycle:
 *   1. Platform calls validateConfig() → checks adapter-specific config
 *   2. Platform calls createSession() → obtains a session handle
 *   3. Platform calls runTurn() one or more times → gets AgentTurnResult
 *   4. Platform calls abort() if needed → interrupts a running turn
 *   5. Platform calls dispose() → releases resources
 *
 * Invariants:
 *   - Adapter MUST NOT directly access SQLite, filesystem, or subprocess APIs
 *   - Adapter MUST NOT import or depend on Electron or React
 *   - Adapter communicates with platform only through contracts types
 */
export interface AgentAdapter {
  /** Static metadata about this adapter */
  readonly metadata: AgentAdapterMetadata;

  /**
   * Create a new agent session.
   * Sessions may be reused across multiple turns or be one-shot.
   */
  createSession(context: AgentSessionContext): Promise<AgentSession>;

  /**
   * Run a single turn within a session.
   * Returns the result synchronously (completed/failed) or streams events.
   */
  runTurn(invocation: AgentInvocation): Promise<AgentTurnResult>;

  /**
   * Abort a running turn by its turn ID.
   * No-op if the turn has already completed.
   */
  abort(turnId: string): Promise<void>;

  /**
   * Release resources for a session or all sessions.
   * If sessionId is omitted, disposes all sessions held by this adapter.
   */
  dispose(sessionId?: string): Promise<void>;

  /**
   * Validate adapter-specific configuration.
   * Returns validation errors or empty array if valid.
   */
  validateConfig(config: unknown): string[];

  /**
   * Map requested capabilities to what this adapter can actually provide.
   * Returns a subset or remapping of the requested capabilities.
   */
  mapCapabilities(requestedCapabilities: readonly AgentCapability[]): AgentCapability[];
}

/**
 * Context provided when creating a session.
 */
export interface AgentSessionContext {
  /** Adapter-specific configuration (validated via validateConfig) */
  readonly config: unknown;
  /** ID of the flow run this session belongs to */
  readonly runId: string;
  /** Additional context from the platform */
  readonly metadata?: Record<string, unknown>;
}
