/**
 * Subagent switch decision type — what the platform decided.
 */
export type SubagentSwitchDecisionType =
  | "approved"
  | "rejected"
  | "rewritten";

/**
 * SubagentSwitchDecision — the platform's ruling on a subagent switch request.
 *
 * The Flow Engine evaluates every SubagentSwitchRequest and issues a
 * decision. Even in "flow-forced" mode, the platform validates and
 * may rewrite the target or task.
 */
export interface SubagentSwitchDecision {
  /** The request this decision corresponds to */
  readonly requestId: string;

  /** The platform's decision */
  readonly decision: SubagentSwitchDecisionType;

  /** The agent the platform actually selected (may differ from request) */
  readonly resolvedAgentId: string;

  /** Task envelope after platform modification */
  readonly effectiveTaskEnvelope: Record<string, unknown>;

  /** Context projection after platform modification */
  readonly effectiveContextProjection?: Record<string, unknown>;

  /** Budget after platform adjustment */
  readonly effectiveBudget?: {
    readonly maxTokens?: number;
    readonly maxCostUsd?: number;
    readonly maxSteps?: number;
  };

  /** Why the platform made this decision */
  readonly rationale: string;

  /** Policy rules that were evaluated during decision */
  readonly policyTrace?: readonly PolicyTraceEntry[];
}

/**
 * A single policy rule evaluation trace entry.
 */
export interface PolicyTraceEntry {
  readonly ruleName: string;
  readonly ruleType: "allowlist" | "capability" | "budget" | "iteration" | "role";
  readonly result: "pass" | "fail" | "override";
  readonly detail?: string;
}
