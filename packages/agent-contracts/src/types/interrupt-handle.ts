/**
 * Interrupt type — why a run was interrupted.
 */
export type InterruptType =
  | "approval"
  | "user-pause"
  | "policy-block"
  | "timeout-warning";

/**
 * InterruptHandle — represents a paused run that can be resumed.
 *
 * When a run is interrupted (e.g., a tool needs approval, user pauses,
 * or a policy blocks execution), the Flow Engine creates an InterruptHandle.
 * The handle contains everything needed to resume the run later.
 */
export interface InterruptHandle {
  /** The run that was interrupted */
  readonly runId: string;

  /** The invocation that was interrupted */
  readonly invocationId: string;

  /** Why the run was interrupted */
  readonly interruptType: InterruptType;

  /** Reference to recoverable state (opaque to consumers) */
  readonly stateRef: string;

  /** Token needed to resume this interrupt */
  readonly resumeToken: string;

  /** When this interrupt expires (epoch ms), 0 = never */
  readonly expiresAt: number;

  /** Human-readable description of the interrupt reason */
  readonly description?: string;
}
