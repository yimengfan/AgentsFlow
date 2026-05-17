import type {
  SubagentSwitchRequest,
  SubagentSwitchDecision,
  SubagentSwitchDecisionType,
  PolicyTraceEntry,
} from "@agentsflow/agent-contracts";
import type { FlowDefinition, AgentDef } from "@agentsflow/flow-schema";

/**
 * SubagentArbiter — evaluates subagent switch requests and issues decisions.
 *
 * The Flow Engine owns scheduling authority. Agents can only propose
 * switches; the arbiter decides based on:
 *   - The node's subagentPolicy allowlist
 *   - Role and capability requirements
 *   - Budget and iteration limits
 *   - The agent's authorized switch modes
 */
export class SubagentArbiter {
  /**
   * Evaluate a subagent switch request against the flow's policies.
   */
  arbitrate(
    request: SubagentSwitchRequest,
    flow: FlowDefinition,
    sourceAgentDef: AgentDef,
  ): SubagentSwitchDecision {
    const trace: PolicyTraceEntry[] = [];

    // 1. Check if the switch mode is allowed
    const allowedModes = sourceAgentDef.subagentPolicy?.switchModes ?? [];
    const modeAllowed = request.mode === "flow-forced" || allowedModes.includes(request.mode);
    trace.push({
      ruleName: "switch-mode-check",
      ruleType: "allowlist",
      result: modeAllowed ? "pass" : "fail",
      detail: `Mode "${request.mode}" ${modeAllowed ? "is" : "is not"} allowed. Allowed: [${allowedModes.join(", ")}]`,
    });

    if (!modeAllowed) {
      return this.reject(request, `Switch mode "${request.mode}" not allowed`, trace);
    }

    // 2. Check if the target agent is in the allowlist
    const allowedAgents = sourceAgentDef.subagentPolicy?.allowedAgents ?? [];
    const agentAllowed = allowedAgents.length === 0 || allowedAgents.includes(request.requestedAgentId);
    trace.push({
      ruleName: "agent-allowlist-check",
      ruleType: "allowlist",
      result: agentAllowed ? "pass" : "fail",
      detail: `Agent "${request.requestedAgentId}" ${agentAllowed ? "is" : "is not"} in allowlist. Allowed: [${allowedAgents.join(", ")}]`,
    });

    if (!agentAllowed) {
      return this.reject(request, `Agent "${request.requestedAgentId}" not in allowlist`, trace);
    }

    // 3. Check if the target agent exists in the flow
    const targetAgentDef = flow.agents.agentDefs.find(
      (a) => a.agentId === request.requestedAgentId,
    );
    if (!targetAgentDef) {
      trace.push({
        ruleName: "agent-exists-check",
        ruleType: "role",
        result: "fail",
        detail: `Agent "${request.requestedAgentId}" not found in flow`,
      });
      return this.reject(request, `Agent "${request.requestedAgentId}" not found in flow`, trace);
    }
    trace.push({
      ruleName: "agent-exists-check",
      ruleType: "role",
      result: "pass",
    });

    // 4. Check delegation budget
    const maxDelegations = sourceAgentDef.subagentPolicy?.maxDelegations;
    if (maxDelegations !== undefined && maxDelegations <= 0) {
      trace.push({
        ruleName: "delegation-budget-check",
        ruleType: "budget",
        result: "fail",
        detail: `Max delegations reached (${maxDelegations})`,
      });
      return this.reject(request, "Delegation budget exhausted", trace);
    }
    trace.push({
      ruleName: "delegation-budget-check",
      ruleType: "budget",
      result: "pass",
    });

    // All checks passed — approve
    return {
      requestId: request.requestId,
      decision: "approved",
      resolvedAgentId: request.requestedAgentId,
      effectiveTaskEnvelope: request.taskEnvelope,
      rationale: "All policy checks passed",
      policyTrace: trace,
      ...(request.contextProjection !== undefined
        ? { effectiveContextProjection: request.contextProjection }
        : {}),
      ...(request.budgetHint !== undefined
        ? { effectiveBudget: request.budgetHint }
        : {}),
    };
  }

  private reject(
    request: SubagentSwitchRequest,
    rationale: string,
    trace: PolicyTraceEntry[],
  ): SubagentSwitchDecision {
    return {
      requestId: request.requestId,
      decision: "rejected",
      resolvedAgentId: request.sourceAgentId,
      effectiveTaskEnvelope: request.taskEnvelope,
      rationale,
      policyTrace: trace,
      ...(request.contextProjection !== undefined
        ? { effectiveContextProjection: request.contextProjection }
        : {}),
    };
  }
}
