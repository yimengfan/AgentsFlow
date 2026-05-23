import type { AgentCapability, StreamDeltaPayload } from "@agentsflow/agent-contracts";
import type {
  PiMonoCreateSessionRequest,
  PiMonoCreateSessionResponse,
  PiMonoResolvedConfig,
  PiMonoTransport,
  PiMonoTurnRequest,
  PiMonoTurnResponse,
} from "./pi-mono-types.js";

export interface PiMonoDeepSeekTransportOptions {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly fetchImpl?: typeof fetch;
}

interface DeepSeekResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: {
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

// ─── SSE stream chunk (OpenAI-compatible) ──────────────────

interface StreamChunk {
  readonly choices?: ReadonlyArray<{
    readonly delta?: {
      readonly content?: string;
      readonly reasoning_content?: string;
    };
    readonly finish_reason?: string;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

/**
 * Parse a single SSE "data:" line into a StreamChunk.
 * Returns undefined for non-data lines, empty lines, or "[DONE]".
 */
function parseSseLine(line: string): StreamChunk | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return undefined;
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload) as StreamChunk;
  } catch {
    return undefined;
  }
}

/**
 * Consume a streaming ReadableStream of SSE events, calling onStreamDelta
 * for each content/reasoning delta. Returns the final accumulated response.
 */
async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onStreamDelta?: (delta: StreamDeltaPayload) => void,
): Promise<DeepSeekResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  let accumulatedReasoning = "";
  let lastUsage: DeepSeekResponse["usage"] | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = parseSseLine(line);
        if (!chunk) continue;

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          accumulatedText += delta.content;
          onStreamDelta?.({
            deltaText: delta.content,
            accumulatedText,
            part: "final",
          });
        }
        if (delta?.reasoning_content) {
          accumulatedReasoning += delta.reasoning_content;
          onStreamDelta?.({
            deltaReasoningText: delta.reasoning_content,
            accumulatedReasoningText: accumulatedReasoning,
            part: "reasoning",
          });
        }
        if (chunk.usage) {
          lastUsage = chunk.usage;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Build a synthetic DeepSeekResponse from accumulated stream data
  return {
    choices: [
      {
        message: {
          content: accumulatedText,
          ...(accumulatedReasoning ? { reasoning_content: accumulatedReasoning } : {}),
        },
      },
    ],
    ...(lastUsage ? { usage: lastUsage } : {}),
  };
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error("Fetch API is not available for pi-mono DeepSeek transport.");
}

function buildMessages(request: PiMonoTurnRequest): ReadonlyArray<{ role: string; content: string }> {
  const history = request.messages
    .filter((message) => message.role !== "tool")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  if (history.length > 0) {
    const lastMessage = history[history.length - 1];
    if (lastMessage?.role === "user" && lastMessage.content === request.prompt) {
      return history;
    }
  }

  return [
    ...history,
    {
      role: "user",
      content: request.prompt,
    },
  ];
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

export function createPiMonoDeepSeekTransport(options: PiMonoDeepSeekTransportOptions): PiMonoTransport {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = resolveFetch(options.fetchImpl);

  return {
    async createSession(request: PiMonoCreateSessionRequest): Promise<PiMonoCreateSessionResponse> {
      return {
        sessionId: `pi-mono-deepseek-${request.runId}-${Date.now()}`,
      };
    },

    async runTurn(request: PiMonoTurnRequest): Promise<PiMonoTurnResponse> {
      const model = request.model ?? options.model;
      if (!model) {
        return {
          status: "failed",
          error: {
            code: "PI_MONO_DEEPSEEK_MODEL_MISSING",
            message: "Missing DeepSeek model for pi-mono transport.",
            category: "adapter",
            retryable: false,
          },
        };
      }

      const shouldStream = request.stream ?? true;

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(request),
          stream: shouldStream,
          ...(request.temperature ?? options.temperature) !== undefined
            ? { temperature: request.temperature ?? options.temperature }
            : {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          status: "failed",
          error: {
            code: "PI_MONO_DEEPSEEK_REQUEST_FAILED",
            message: `DeepSeek request failed: ${response.status} ${response.statusText}`,
            category: "adapter",
            retryable: false,
            details: { responseText: errorText },
          },
        };
      }

      let payload: DeepSeekResponse;

      if (shouldStream && response.body) {
        // Streaming mode: consume SSE events and emit deltas
        payload = await consumeSseStream(response.body, request.onStreamDelta);
      } else {
        // Non-streaming mode: parse full JSON response
        payload = await response.json() as DeepSeekResponse;
      }

      const message = payload.choices?.[0]?.message;
      const rawContent = message?.content?.trim();
      if (!rawContent) {
        return {
          status: "failed",
          error: {
            code: "PI_MONO_DEEPSEEK_EMPTY_RESPONSE",
            message: payload.error?.message ?? "DeepSeek returned an empty response.",
            category: "adapter",
            retryable: false,
          },
        };
      }

      const structuredOutput = parseStructuredOutput(rawContent);
      const evaluateReason = request.turnMode === "evaluate"
        ? structuredOutput?.reason
        : undefined;

      return {
        status: "completed",
        finalText: typeof evaluateReason === "string" && evaluateReason.trim().length > 0
          ? evaluateReason
          : rawContent,
        ...(structuredOutput !== undefined ? { structuredOutput } : {}),
        ...(message?.reasoning_content?.trim() ? { reasoningText: message.reasoning_content.trim() } : {}),
        ...(message?.tool_calls?.length
          ? {
            toolCalls: message.tool_calls.map((toolCall) => ({
              toolCallId: toolCall.id ?? `tool-${Date.now()}`,
              toolName: toolCall.function?.name ?? toolCall.type ?? "tool-call",
              status: "pending_approval" as const,
            })),
            warnings: ["Tool calls were proposed by the model but not executed by the pi-mono DeepSeek transport."],
          }
          : {}),
        ...(payload.usage
          ? {
            usage: {
              ...(payload.usage.prompt_tokens !== undefined ? { inputTokens: payload.usage.prompt_tokens } : {}),
              ...(payload.usage.completion_tokens !== undefined ? { outputTokens: payload.usage.completion_tokens } : {}),
              ...(payload.usage.total_tokens !== undefined ? { totalTokens: payload.usage.total_tokens } : {}),
            },
          }
          : {}),
      };
    },

    async abort(): Promise<void> {
      return;
    },

    async dispose(): Promise<void> {
      return;
    },

    validateConfig(config: PiMonoResolvedConfig): string[] {
      const errors: string[] = [];
      if (!config.baseUrl) {
        errors.push("Missing DeepSeek base URL for pi-mono transport.");
      }
      if (!config.apiKey) {
        errors.push("Missing DeepSeek API key for pi-mono transport.");
      }
      if (!config.model) {
        errors.push("Missing DeepSeek model for pi-mono transport.");
      }
      return errors;
    },

    mapCapabilities(requestedCapabilities: readonly AgentCapability[]): AgentCapability[] {
      const supported = new Set<AgentCapability>(["structured-output", "tool-calls", "multi-turn-session"]);
      return requestedCapabilities.filter((capability) => supported.has(capability));
    },
  };
}