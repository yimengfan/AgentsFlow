import type {
  AgentAdapter,
  AgentInvocation,
  AgentSession,
  AgentSessionContext,
  AgentTurnError,
  AgentTurnResult,
  AgentTurnUsage,
} from "@agentsflow/agent-contracts";

interface DeepSeekConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
}

interface ResolvedDeepSeekConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature?: number;
}

interface DeepSeekResponse {
  readonly id?: string;
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly role?: string;
      readonly content?: string;
      readonly reasoning_content?: string;
      readonly tool_calls?: ReadonlyArray<{
        readonly id?: string;
        readonly type?: string;
        readonly function?: {
          readonly name?: string;
          readonly arguments?: string;
        };
      }>;
    };
    readonly finish_reason?: string;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
  readonly error?: {
    readonly message?: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function readEnvValue(name: string): string | undefined {
  try {
    if (typeof import.meta !== "undefined") {
      const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
      const value = env?.[name];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  } catch {
    // ignore import.meta access outside bundled environments
  }

  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = globalWithProcess.process?.env?.[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function createError(
  message: string,
  details?: Record<string, unknown>,
): AgentTurnError {
  return {
    code: "DEEPSEEK_REQUEST_FAILED",
    message,
    category: "adapter",
    retryable: false,
    ...(details !== undefined ? { details } : {}),
  };
}

function buildUsage(usage: DeepSeekResponse["usage"]): AgentTurnUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    ...(usage.prompt_tokens !== undefined ? { inputTokens: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens !== undefined ? { outputTokens: usage.completion_tokens } : {}),
    ...(usage.total_tokens !== undefined ? { totalTokens: usage.total_tokens } : {}),
  };
}

function findBalancedJsonSegment(text: string): string | undefined {
  const openings = ["{", "["] as const;
  for (let index = 0; index < text.length; index++) {
    const opening = text[index];
    if (!openings.includes(opening as "{" | "[")) {
      continue;
    }

    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let cursor = index; cursor < text.length; cursor++) {
      const char = text[cursor];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (char === "\\") {
          isEscaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === opening) {
        depth++;
        continue;
      }

      if (char === closing) {
        depth--;
        if (depth === 0) {
          return text.slice(index, cursor + 1);
        }
      }
    }
  }

  return undefined;
}

function parseStructuredOutput(content: string): Record<string, unknown> | undefined {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced && fenced.length > 0 ? fenced : findBalancedJsonSegment(content);
  if (!candidate) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

export class DeepSeekChatAdapter implements AgentAdapter {
  readonly metadata = {
    adapterKind: "deepseek",
    displayName: "DeepSeek Chat",
    adapterVersion: "0.1.0",
    contractVersion: "1.0",
    supportedCapabilities: ["structured-output"] as const,
    limitations: ["No tool calls or streaming support in the local runtime adapter."] as const,
  };

  private sessions = new Map<string, AgentSessionContext>();

  createSession(context: AgentSessionContext): Promise<AgentSession> {
    const errors = this.validateConfig(context.config);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const sessionId = `deepseek-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessions.set(sessionId, context);
    return Promise.resolve({
      sessionId,
      adapterKind: this.metadata.adapterKind,
    });
  }

  async runTurn(invocation: AgentInvocation): Promise<AgentTurnResult> {
    try {
      const sessionConfig = invocation.sessionId
        ? this.sessions.get(invocation.sessionId)?.config
        : undefined;
      const config = this.resolveConfig(sessionConfig, invocation);
      const prompt = this.resolvePrompt(invocation);

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          stream: false,
          ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          invocationId: invocation.invocationId,
          status: "failed",
          error: createError(`DeepSeek request failed: ${response.status} ${response.statusText}`, {
            responseText: errorText,
          }),
        };
      }

      const payload = await response.json() as DeepSeekResponse;
      const message = payload.choices?.[0]?.message;
      const rawContent = message?.content?.trim();
      if (!rawContent) {
        return {
          invocationId: invocation.invocationId,
          status: "failed",
          error: createError(payload.error?.message ?? "DeepSeek returned an empty response body."),
        };
      }

      const structuredOutput = parseStructuredOutput(rawContent);
      const usage = buildUsage(payload.usage);
      const reasoningText = message?.reasoning_content?.trim();
      const toolCalls = message?.tool_calls?.map((toolCall) => ({
        toolCallId: toolCall.id ?? `tool-${Date.now()}`,
        toolName: toolCall.function?.name ?? toolCall.type ?? "tool-call",
        status: "pending_approval" as const,
      }));
      const evaluateReason = invocation.turnMode === "evaluate"
        ? structuredOutput?.reason
        : undefined;

      return {
        invocationId: invocation.invocationId,
        status: "completed",
        finalText: typeof evaluateReason === "string" && evaluateReason.trim().length > 0
          ? evaluateReason
          : rawContent,
        ...(structuredOutput !== undefined ? { structuredOutput } : {}),
        ...(reasoningText && reasoningText.length > 0 ? { reasoningText } : {}),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
        ...(usage !== undefined ? { usage } : {}),
        ...(toolCalls && toolCalls.length > 0
          ? { warnings: ["Tool calls were proposed by the model but not executed by the local DeepSeek adapter."] }
          : {}),
      };
    } catch (error) {
      return {
        invocationId: invocation.invocationId,
        status: "failed",
        error: createError(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  abort(_turnId: string): Promise<void> {
    return Promise.resolve();
  }

  dispose(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
    return Promise.resolve();
  }

  validateConfig(config: unknown): string[] {
    const resolved = this.resolveConfig(config, undefined, true);
    const errors: string[] = [];
    if (!resolved.apiKey) {
      errors.push("Missing DeepSeek API key. Set VITE_AGENTSFLOW_LLM_API_KEY or adapterConfig.apiKey.");
    }
    if (!resolved.model) {
      errors.push("Missing DeepSeek model. Set VITE_AGENTSFLOW_LLM_MODEL or agent modelProfile.model.");
    }
    if (!resolved.baseUrl) {
      errors.push("Missing DeepSeek base URL. Set VITE_AGENTSFLOW_LLM_BASE_URL or adapterConfig.baseUrl.");
    }
    return errors;
  }

  mapCapabilities(): typeof this.metadata.supportedCapabilities[number][] {
    return [];
  }

  private resolvePrompt(invocation: AgentInvocation): string {
    const input = asRecord(invocation.input);
    const prompt = invocation.prompt?.trim();
    if (prompt && prompt.length > 0) {
      return prompt;
    }

    const fallback = input?.userPrompt ?? input?.prompt ?? input?.data;
    if (typeof fallback === "string" && fallback.trim().length > 0) {
      return fallback;
    }
    if (fallback !== undefined) {
      try {
        return JSON.stringify(fallback, null, 2);
      } catch {
        return String(fallback);
      }
    }

    return "Please complete the requested task.";
  }

  private resolveConfig(
    config: unknown,
    invocation?: AgentInvocation,
    allowPartial = false,
  ): ResolvedDeepSeekConfig | DeepSeekConfig {
    const adapterConfig = asRecord(config);
    const metadata = asRecord(invocation?.metadata);
    const metadataConfig = asRecord(metadata?.adapterConfig);
    const modelProfile = asRecord(metadata?.modelProfile);

    const apiKey = this.pickString(
      metadataConfig?.apiKey,
      adapterConfig?.apiKey,
      readEnvValue("VITE_AGENTSFLOW_LLM_API_KEY"),
    );
    const baseUrl = this.pickString(
      metadataConfig?.baseUrl,
      adapterConfig?.baseUrl,
      readEnvValue("VITE_AGENTSFLOW_LLM_BASE_URL"),
      "https://api.deepseek.com",
    );
    const model = this.pickString(
      modelProfile?.model,
      metadataConfig?.model,
      adapterConfig?.model,
      readEnvValue("VITE_AGENTSFLOW_LLM_MODEL"),
      "deepseek-v4-flash",
    );
    const temperature = this.pickNumber(
      modelProfile?.temperature,
      metadataConfig?.temperature,
      adapterConfig?.temperature,
    );

    if (allowPartial) {
      return {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      };
    }

    return {
      apiKey: apiKey ?? "",
      baseUrl: normalizeBaseUrl(baseUrl ?? "https://api.deepseek.com"),
      model: model ?? "deepseek-v4-flash",
      ...(temperature !== undefined ? { temperature } : {}),
    };
  }

  private pickString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }
}