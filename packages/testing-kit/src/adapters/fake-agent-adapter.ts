import type {
  AgentAdapter,
  AgentAdapterMetadata,
  AgentCapability,
  AgentSession,
  AgentSessionContext,
  AgentInvocation,
  AgentTurnResult,
  TurnMode,
} from "@agentsflow/agent-contracts";

/**
 * Configuration for the FakeAgentAdapter.
 * Controls behavior for testing different scenarios.
 */
export interface FakeAdapterConfig {
  /** Delay in ms before returning a result (simulates latency) */
  turnDelayMs?: number;
  /** Text to return in finalText */
  responseText?: string;
  /** Whether to propose a subagent switch */
  proposeSubagent?: {
    agentId: string;
    reason: string;
  };
  /** Whether to simulate streaming by emitting delta events */
  simulateStreaming?: boolean;
  /** Whether the next turn should fail */
  shouldFail?: boolean;
  /** Error message when shouldFail is true */
  errorMessage?: string;
  /** Memory writes to propose */
  memoryWrites?: Array<{
    targetScope: string;
    content: unknown;
  }>;
  /** Tool calls to report */
  toolCalls?: Array<{
    toolName: string;
    status: "success" | "failed" | "pending_approval";
  }>;
  /** Custom usage statistics */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
  };
  /**
   * Per-turn-mode response overrides.
   * When set, these take precedence over responseText for the matching turnMode.
   */
  turnModeResponses?: {
    plan?: { finalText?: string; structuredOutput?: Record<string, unknown> };
    evaluate?: { finalText?: string; structuredOutput?: Record<string, unknown> };
    normal?: { finalText?: string; structuredOutput?: Record<string, unknown> };
    summarize?: { finalText?: string; structuredOutput?: Record<string, unknown> };
  };
  /**
   * Score progression for evaluate turns (0-1 per iteration).
   * If set, the Nth evaluate call returns the Nth score.
   * If not set, defaults to gradually increasing scores.
   */
  evaluateScoreProgression?: readonly number[];
}

const DEFAULT_METADATA: AgentAdapterMetadata = {
  adapterKind: "fake",
  displayName: "Fake Adapter (Testing)",
  adapterVersion: "0.1.0",
  contractVersion: "0.1.0",
  supportedCapabilities: [
    "streaming",
    "structured-output",
    "tool-calls",
    "delegation-proposal",
    "interrupt-resume",
    "multi-turn-session",
  ],
  limitations: ["Not a real agent — returns canned responses only"],
};

/**
 * FakeAgentAdapter — a test double that implements AgentAdapter.
 *
 * Used to verify that the Flow Engine, Agent Registry, and UI
 * work correctly without requiring a real agent backend.
 *
 * Behavior is configurable via FakeAdapterConfig.
 * Supports turnMode-aware responses for plan/evaluate/normal/summarize.
 */
export class FakeAgentAdapter implements AgentAdapter {
  readonly metadata: AgentAdapterMetadata;
  private config: FakeAdapterConfig;
  private sessions: Map<string, AgentSession> = new Map();
  private turnCounter = 0;
  private evaluateCounter = 0;

  constructor(config: FakeAdapterConfig = {}, metadata?: Partial<AgentAdapterMetadata>) {
    this.config = config;
    this.metadata = {
      ...DEFAULT_METADATA,
      ...metadata,
    };
  }

  /** Update configuration (e.g., between turns in a test) */
  updateConfig(config: FakeAdapterConfig): void {
    this.config = config;
  }

  async createSession(context: AgentSessionContext): Promise<AgentSession> {
    const sessionId = `fake-session-${context.runId}-${Date.now()}`;
    const session: AgentSession = {
      sessionId,
      adapterKind: "fake",
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async runTurn(invocation: AgentInvocation): Promise<AgentTurnResult> {
    this.turnCounter++;

    // Simulate latency
    if (this.config.turnDelayMs && this.config.turnDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.turnDelayMs));
    }

    // Simulate failure
    if (this.config.shouldFail) {
      return {
        invocationId: invocation.invocationId,
        status: "failed",
        error: {
          code: "FAKE_ADAPTER_ERROR",
          message: this.config.errorMessage ?? "Fake adapter was configured to fail",
          category: "adapter",
          retryable: true,
        },
      };
    }

    // Collect used capabilities
    const usedCapabilities: AgentCapability[] = [];

    // Build tool call summaries if configured
    const toolCalls =
      this.config.toolCalls && this.config.toolCalls.length > 0
        ? this.config.toolCalls.map((tc, i) => ({
            toolCallId: `fake-tool-call-${i}`,
            toolName: tc.toolName,
            status: tc.status,
            durationMs: 50,
          }))
        : undefined;
    if (toolCalls) {
      usedCapabilities.push("tool-calls");
    }

    // Build memory writes if configured
    const memoryWrites =
      this.config.memoryWrites && this.config.memoryWrites.length > 0
        ? this.config.memoryWrites.map((mw, i) => ({
            writeId: `fake-write-${i}`,
            targetScope: mw.targetScope,
            operation: "append" as const,
            content: mw.content,
            provenance: {
              nodeId: invocation.nodeId,
              agentId: invocation.agentId,
              invocationId: invocation.invocationId,
            },
            visibility: "same-run" as const,
          }))
        : undefined;

    // Build subagent delegation proposal if configured
    const delegationProposal = this.config.proposeSubagent
      ? {
          requestId: `fake-delegation-${this.turnCounter}`,
          sourceInvocationId: invocation.invocationId,
          sourceAgentId: invocation.agentId,
          requestedAgentId: this.config.proposeSubagent.agentId,
          mode: "agent-suggested" as const,
          reason: this.config.proposeSubagent.reason,
          taskEnvelope: { task: "fake delegated task" },
          returnStrategy: "summary-only" as const,
        }
      : undefined;
    if (delegationProposal) {
      usedCapabilities.push("delegation-proposal");
    }

    // Build turn-mode-aware response
    const { finalText, structuredOutput } = this.buildTurnResponse(invocation);

    // Build successful result
    return {
      invocationId: invocation.invocationId,
      status: "completed",
      finalText,
      ...(structuredOutput ? { structuredOutput } : {}),
      usage: {
        inputTokens: this.config.usage?.inputTokens ?? 100,
        outputTokens: this.config.usage?.outputTokens ?? 50,
        totalTokens: (this.config.usage?.inputTokens ?? 100) + (this.config.usage?.outputTokens ?? 50),
        durationMs: this.config.usage?.durationMs ?? this.config.turnDelayMs ?? 10,
        steps: 1,
      },
      ...(toolCalls ? { toolCalls } : {}),
      ...(memoryWrites ? { memoryWrites } : {}),
      ...(delegationProposal ? { delegationProposal } : {}),
      ...(usedCapabilities.length > 0 ? { usedCapabilities } : {}),
    };
  }

  /**
   * Build a turn-mode-aware response.
   * Returns different content based on invocation.turnMode:
   *   - plan: returns a structured plan
   *   - evaluate: returns a score/canComplete/reason
   *   - normal: returns an execution result
   *   - summarize: returns a summary
   */
  private buildTurnResponse(
    invocation: AgentInvocation,
  ): { finalText: string; structuredOutput?: Record<string, unknown> } {
    const turnMode: TurnMode = invocation.turnMode ?? "normal";

    // Check for per-turn-mode overrides in config
    const modeOverride = this.config.turnModeResponses?.[turnMode];
    if (modeOverride) {
      return {
        finalText: modeOverride.finalText ?? `Fake ${turnMode} response`,
        ...(modeOverride.structuredOutput ? { structuredOutput: modeOverride.structuredOutput } : {}),
      };
    }

    switch (turnMode) {
      case "plan": {
        const task = (invocation.input as Record<string, unknown>).userPrompt ?? "the given task";
        const plan = {
          goal: `Accomplish: ${task}`,
          steps: [
            { step: 1, action: "Analyze the input and requirements" },
            { step: 2, action: "Execute the main processing logic" },
            { step: 3, action: "Verify the result meets requirements" },
          ],
          estimatedIterations: 2,
        };
        return {
          finalText: `Plan created for: ${task}`,
          structuredOutput: plan,
        };
      }

      case "evaluate": {
        this.evaluateCounter++;
        // Use score progression if provided, otherwise gradually increase
        const progression = this.config.evaluateScoreProgression;
        const score = progression
          ? (progression[this.evaluateCounter - 1] ?? progression[progression.length - 1] ?? 1.0)
          : Math.min(0.5 + this.evaluateCounter * 0.2, 1.0);

        const canComplete = score >= 0.8;
        const evalResult = {
          score,
          canComplete,
          reason: canComplete
            ? `Evaluation score ${score.toFixed(2)} meets threshold (>= 0.8). Task can be completed.`
            : `Evaluation score ${score.toFixed(2)} is below threshold (0.8). Iteration ${this.evaluateCounter} needs more work.`,
        };
        return {
          finalText: evalResult.reason,
          structuredOutput: evalResult,
        };
      }

      case "summarize": {
        const previousResult = (invocation.input as Record<string, unknown>).previousResult as string | undefined;
        return {
          finalText: `Summary: ${previousResult ?? "Task completed successfully"}`,
        };
      }

      case "normal":
      default: {
        const input = invocation.input;
        const prompt = invocation.prompt ?? "";
        return {
          finalText: this.config.responseText
            ?? `Fake execution result for node "${invocation.nodeId}" (turn ${this.turnCounter}). Input keys: [${Object.keys(input).join(", ")}]. Prompt: "${prompt.slice(0, 100)}"`,
        };
      }
    }
  }

  async abort(_turnId: string): Promise<void> {
    // No-op for fake adapter
  }

  async dispose(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
  }

  validateConfig(config: unknown): string[] {
    const errors: string[] = [];
    if (config !== null && config !== undefined && typeof config !== "object") {
      errors.push("FakeAdapterConfig must be an object or null/undefined");
    }
    return errors;
  }

  mapCapabilities(requestedCapabilities: readonly AgentCapability[]): AgentCapability[] {
    // Fake adapter claims to support all requested capabilities
    return [...requestedCapabilities];
  }
}
