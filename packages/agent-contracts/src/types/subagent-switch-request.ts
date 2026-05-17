/**
 * Subagent switch mode — who initiates the switch.
 *
 * - flow-forced: The flow explicitly dictates which agent runs next
 * - policy-resolved: The agent proposes, the platform decides via policy
 * - agent-suggested: The agent recommends a switch, platform may accept or reject
 */
export type SubagentSwitchMode =
  | "flow-forced"
  | "policy-resolved"
  | "agent-suggested";

/**
 * Return strategy — what to bring back from the subagent.
 */
export type SubagentReturnStrategy =
  | "summary-only"
  | "full-trace"
  | "structured-output";

/**
 * SubagentSwitchRequest — an agent proposes switching to a subagent.
 *
 * The platform (Flow Engine) evaluates this request against:
 *   - The node's subagentPolicy allowlist
 *   - Role and capability requirements
 *   - Budget and iteration limits
 *   - The agent's authorized switch modes
 *
 * Only after the platform issues a SubagentSwitchDecision can the
 * actual handoff proceed.
 */
export interface SubagentSwitchRequest {
  /** Unique request ID */
  readonly requestId: string;

  /** The invocation that triggered this request */
  readonly sourceInvocationId: string;

  /** Current agent that wants to switch */
  readonly sourceAgentId: string;

  /** Desired target agent */
  readonly requestedAgentId: string;

  /** Switch mode */
  readonly mode: SubagentSwitchMode;

  /** Reason for the switch */
  readonly reason: string;

  /** Task payload to hand to the subagent */
  readonly taskEnvelope: Record<string, unknown>;

  /** Context summary to pass to the subagent */
  readonly contextProjection?: Record<string, unknown>;

  /** Capabilities the subagent should have */
  readonly requestedCapabilities?: readonly string[];

  /** Budget hint for the subagent's work */
  readonly budgetHint?: {
    readonly maxTokens?: number;
    readonly maxCostUsd?: number;
    readonly maxSteps?: number;
  };

  /** What to bring back from the subagent */
  readonly returnStrategy: SubagentReturnStrategy;
}
