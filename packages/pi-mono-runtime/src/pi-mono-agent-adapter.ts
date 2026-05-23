import type {
  AgentAdapter,
  AgentAdapterMetadata,
  AgentCapability,
  AgentInvocation,
  AgentSession,
  AgentSessionContext,
  AgentTurnError,
  AgentTurnResult,
} from "@agentsflow/agent-contracts";
import { createPiMonoHttpTransport } from "./pi-mono-http-transport.js";
import type {
  PiMonoAdapterOptions,
  PiMonoResolvedConfig,
  PiMonoTransport,
  PiMonoTurnResponse,
} from "./pi-mono-types.js";
import { createPiMonoDeepSeekTransport } from "./pi-mono-deepseek-transport.js";

interface SessionRecord {
  readonly context: AgentSessionContext;
  readonly config: PiMonoResolvedConfig;
  readonly transport: PiMonoTransport;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function readEnvValue(...names: readonly string[]): string | undefined {
  try {
    if (typeof import.meta !== "undefined") {
      const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
      for (const name of names) {
        const value = env?.[name];
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
    }
  } catch {
    // ignore import.meta access outside bundled environments
  }

  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  for (const name of names) {
    const value = globalWithProcess.process?.env?.[name];
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isDeepSeekBaseUrl(baseUrl: string | undefined): boolean {
  return typeof baseUrl === "string" && /api\.deepseek\.com/i.test(baseUrl);
}

function readTransportKind(config: PiMonoResolvedConfig): string | undefined {
  const raw = config.adapterConfig?.transport;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim().toLowerCase() : undefined;
}

function createError(message: string, details?: Record<string, unknown>): AgentTurnError {
  return {
    code: "PI_MONO_REQUEST_FAILED",
    message,
    category: "adapter",
    retryable: false,
    ...(details !== undefined ? { details } : {}),
  };
}

function normalizeFailureResponse(response: PiMonoTurnResponse): AgentTurnResponseFailure {
  const status = response.status && response.status !== "completed"
    ? response.status
    : "failed";

  return {
    status,
    error: response.error ?? createError("pi-mono turn failed without an error payload."),
  };
}

interface AgentTurnResponseFailure {
  readonly status: Exclude<AgentTurnResult["status"], "completed">;
  readonly error: AgentTurnError;
}

const PI_MONO_SUPPORTED_CAPABILITIES = ["structured-output", "tool-calls", "multi-turn-session"] as const;

export class PiMonoAgentAdapter implements AgentAdapter {
  readonly metadata: AgentAdapterMetadata = {
    adapterKind: "pi-mono",
    displayName: "pi-mono",
    adapterVersion: "0.1.0",
    contractVersion: "1.0",
    supportedCapabilities: PI_MONO_SUPPORTED_CAPABILITIES,
    limitations: [
      "Default transport expects either a pi-mono-compatible HTTP server (/sessions and /turns) or a DeepSeek-compatible chat endpoint when configured with DeepSeek credentials.",
    ],
  };

  private readonly sessions = new Map<string, SessionRecord>();
  private readonly options: PiMonoAdapterOptions;

  constructor(options: PiMonoAdapterOptions = {}) {
    this.options = options;
  }

  async createSession(context: AgentSessionContext): Promise<AgentSession> {
    const config = this.resolveConfig(context.config);
    const transport = this.resolveTransport(config);
    const errors = [
      ...this.validateResolvedConfig(config, transport),
      ...(transport.validateConfig?.(config) ?? []),
    ];
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const session = await transport.createSession({
      runId: context.runId,
      ...(config.flowName !== undefined ? { flowName: config.flowName } : {}),
      ...(config.model !== undefined ? { model: config.model } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.adapterConfig !== undefined ? { adapterConfig: config.adapterConfig } : {}),
      ...(context.metadata !== undefined ? { metadata: context.metadata } : {}),
    });

    this.sessions.set(session.sessionId, {
      context,
      config,
      transport,
    });

    return {
      sessionId: session.sessionId,
      adapterKind: this.metadata.adapterKind,
    };
  }

  async runTurn(invocation: AgentInvocation): Promise<AgentTurnResult> {
    try {
      const sessionRecord = invocation.sessionId ? this.sessions.get(invocation.sessionId) : undefined;
      const config = this.resolveConfig(sessionRecord?.context.config, invocation);
      const transport = sessionRecord?.transport ?? this.resolveTransport(config);
      const prompt = this.resolvePrompt(invocation);
      const response = await transport.runTurn({
        ...(invocation.sessionId !== undefined ? { sessionId: invocation.sessionId } : {}),
        invocationId: invocation.invocationId,
        runId: invocation.runId,
        nodeId: invocation.nodeId,
        agentId: invocation.agentId,
        turnMode: invocation.turnMode,
        prompt,
        input: invocation.input,
        messages: invocation.messages,
        ...(invocation.expectedOutput !== undefined ? { expectedOutput: invocation.expectedOutput } : {}),
        ...(config.flowName !== undefined ? { flowName: config.flowName } : {}),
        ...(config.model !== undefined ? { model: config.model } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(config.adapterConfig !== undefined ? { adapterConfig: config.adapterConfig } : {}),
        ...(invocation.metadata !== undefined ? { metadata: invocation.metadata } : {}),
        ...(invocation.stream !== undefined ? { stream: invocation.stream } : {}),
        ...(invocation.onStreamDelta !== undefined ? { onStreamDelta: invocation.onStreamDelta } : {}),
      });

      if (response.status && response.status !== "completed") {
        const failure = normalizeFailureResponse(response);
        return {
          invocationId: invocation.invocationId,
          status: failure.status,
          error: failure.error,
        };
      }

      return {
        invocationId: invocation.invocationId,
        status: "completed",
        ...(response.finalText !== undefined ? { finalText: response.finalText } : {}),
        ...(response.structuredOutput !== undefined ? { structuredOutput: response.structuredOutput } : {}),
        ...(response.reasoningText !== undefined ? { reasoningText: response.reasoningText } : {}),
        ...(response.toolCalls !== undefined ? { toolCalls: response.toolCalls } : {}),
        ...(response.artifacts !== undefined ? { artifacts: response.artifacts } : {}),
        ...(response.usage !== undefined ? { usage: response.usage } : {}),
        ...(response.warnings !== undefined ? { warnings: response.warnings } : {}),
        ...(response.rawPayloadRef !== undefined ? { rawAdapterPayloadRef: response.rawPayloadRef } : {}),
        ...(response.usedCapabilities !== undefined ? { usedCapabilities: response.usedCapabilities } : {}),
      };
    } catch (error) {
      return {
        invocationId: invocation.invocationId,
        status: "failed",
        error: createError(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async abort(turnId: string): Promise<void> {
    if (this.options.transport) {
      await this.options.transport.abort(turnId);
      return;
    }

    const sessions = [...this.sessions.values()];
    await Promise.all(sessions.map((session) => session.transport.abort(turnId).catch(() => undefined)));
  }

  async dispose(sessionId?: string): Promise<void> {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      await session?.transport.dispose(sessionId);
      this.sessions.delete(sessionId);
      return;
    }

    await Promise.all([...this.sessions.entries()].map(async ([id, session]) => {
      await session.transport.dispose(id);
      this.sessions.delete(id);
    }));
  }

  validateConfig(config: unknown): string[] {
    const resolved = this.resolveConfig(config);
    const transport = this.options.transport ?? (resolved.baseUrl ? this.resolveTransport(resolved) : undefined);
    return [
      ...this.validateResolvedConfig(resolved, transport),
      ...(transport?.validateConfig?.(resolved) ?? []),
    ];
  }

  mapCapabilities(requestedCapabilities: readonly AgentCapability[]): AgentCapability[] {
    if (this.options.transport?.mapCapabilities) {
      return this.options.transport.mapCapabilities(requestedCapabilities);
    }

    const supported = new Set<AgentCapability>(PI_MONO_SUPPORTED_CAPABILITIES);
    return requestedCapabilities.filter((capability) => supported.has(capability));
  }

  private validateResolvedConfig(config: PiMonoResolvedConfig, transport: PiMonoTransport | undefined): string[] {
    if (transport) {
      return [];
    }
    return !config.baseUrl ? ["Missing pi-mono base URL. Set adapterConfig.baseUrl or VITE_AGENTSFLOW_PI_MONO_BASE_URL."] : [];
  }

  private resolveTransport(config: PiMonoResolvedConfig): PiMonoTransport {
    if (this.options.transport) {
      return this.options.transport;
    }
    const transportKind = readTransportKind(config);
    if (transportKind === "deepseek" || (transportKind === undefined && isDeepSeekBaseUrl(config.baseUrl))) {
      if (!config.baseUrl) {
        throw new Error("Missing DeepSeek base URL for pi-mono transport.");
      }
      return createPiMonoDeepSeekTransport({
        baseUrl: config.baseUrl,
        ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
        ...(config.model !== undefined ? { model: config.model } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(this.options.fetchImpl !== undefined ? { fetchImpl: this.options.fetchImpl } : {}),
      });
    }
    if (!config.baseUrl) {
      throw new Error("Missing pi-mono base URL.");
    }
    return createPiMonoHttpTransport({
      baseUrl: config.baseUrl,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(this.options.fetchImpl !== undefined ? { fetchImpl: this.options.fetchImpl } : {}),
    });
  }

  private resolvePrompt(invocation: AgentInvocation): string {
    const prompt = invocation.prompt?.trim();
    if (prompt) {
      return prompt;
    }

    const input = asRecord(invocation.input);
    const fallback = input?.userPrompt ?? input?.prompt ?? input?.data ?? input?.previousResult;
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

  private resolveConfig(config: unknown, invocation?: AgentInvocation): PiMonoResolvedConfig {
    const sessionConfig = asRecord(config);
    const invocationMetadata = asRecord(invocation?.metadata);
    const invocationAdapterConfig = asRecord(invocationMetadata?.adapterConfig);
    const constructorAdapterConfig = asRecord(this.options.adapterConfig);
    const modelProfile = asRecord(invocationMetadata?.modelProfile);

    const adapterConfig = {
      ...(constructorAdapterConfig ?? {}),
      ...(sessionConfig ?? {}),
      ...(invocationAdapterConfig ?? {}),
    };

    const baseUrl = typeof adapterConfig.baseUrl === "string"
      ? adapterConfig.baseUrl
      : this.options.baseUrl ?? readEnvValue(
        "VITE_AGENTSFLOW_PI_MONO_BASE_URL",
        "AGENTSFLOW_PI_MONO_BASE_URL",
        "VITE_AGENTSFLOW_LLM_BASE_URL",
      );
    const apiKey = typeof adapterConfig.apiKey === "string"
      ? adapterConfig.apiKey
      : this.options.apiKey ?? readEnvValue(
        "VITE_AGENTSFLOW_PI_MONO_API_KEY",
        "AGENTSFLOW_PI_MONO_API_KEY",
        "VITE_AGENTSFLOW_LLM_API_KEY",
      );
    const model = typeof modelProfile?.model === "string"
      ? modelProfile.model
      : typeof adapterConfig.model === "string"
        ? adapterConfig.model
        : this.options.model ?? readEnvValue(
          "VITE_AGENTSFLOW_PI_MONO_MODEL",
          "AGENTSFLOW_PI_MONO_MODEL",
          "VITE_AGENTSFLOW_LLM_MODEL",
        );
    const temperature = readOptionalNumber(modelProfile?.temperature)
      ?? readOptionalNumber(adapterConfig.temperature)
      ?? this.options.temperature
      ?? readOptionalNumber(readEnvValue("VITE_AGENTSFLOW_PI_MONO_TEMPERATURE", "AGENTSFLOW_PI_MONO_TEMPERATURE"));

    return {
      ...(this.options.flowName !== undefined ? { flowName: this.options.flowName } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(Object.keys(adapterConfig).length > 0 ? { adapterConfig } : {}),
    };
  }
}