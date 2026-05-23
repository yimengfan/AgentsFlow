import type { AgentCapability } from "@agentsflow/agent-contracts";
import type {
  PiMonoCreateSessionRequest,
  PiMonoCreateSessionResponse,
  PiMonoResolvedConfig,
  PiMonoTransport,
  PiMonoTurnRequest,
  PiMonoTurnResponse,
} from "./pi-mono-types.js";

export interface PiMonoHttpTransportOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error("Fetch API is not available for pi-mono HTTP transport.");
}

async function parseJsonResponse<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined;
  }
  return JSON.parse(text) as T;
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetchImpl(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`pi-mono HTTP ${response.status} ${response.statusText}: ${errorText}`);
  }

  const parsed = await parseJsonResponse<T>(response);
  if (parsed === undefined) {
    throw new Error(`pi-mono HTTP endpoint returned an empty body: ${url}`);
  }
  return parsed;
}

export function createPiMonoHttpTransport(options: PiMonoHttpTransportOptions): PiMonoTransport {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = resolveFetch(options.fetchImpl);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
  };

  return {
    createSession(request: PiMonoCreateSessionRequest): Promise<PiMonoCreateSessionResponse> {
      return requestJson<PiMonoCreateSessionResponse>(fetchImpl, `${baseUrl}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });
    },

    runTurn(request: PiMonoTurnRequest): Promise<PiMonoTurnResponse> {
      // Strip non-serializable fields before sending over HTTP
      const { onStreamDelta, stream, ...serializable } = request;
      void onStreamDelta;
      void stream;
      return requestJson<PiMonoTurnResponse>(fetchImpl, `${baseUrl}/turns`, {
        method: "POST",
        headers,
        body: JSON.stringify(serializable),
      });
    },

    abort(turnId: string): Promise<void> {
      return fetchImpl(`${baseUrl}/turns/${encodeURIComponent(turnId)}/abort`, {
        method: "POST",
        headers,
      }).then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`pi-mono abort failed: ${response.status} ${response.statusText}: ${errorText}`);
        }
      });
    },

    dispose(sessionId?: string): Promise<void> {
      if (!sessionId) {
        return Promise.resolve();
      }

      return fetchImpl(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers,
      }).then(async (response) => {
        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          throw new Error(`pi-mono dispose failed: ${response.status} ${response.statusText}: ${errorText}`);
        }
      });
    },

    validateConfig(config: PiMonoResolvedConfig): string[] {
      return !config.baseUrl ? ["Missing pi-mono base URL. Set adapterConfig.baseUrl or VITE_AGENTSFLOW_PI_MONO_BASE_URL."] : [];
    },

    mapCapabilities(requestedCapabilities: readonly AgentCapability[]): AgentCapability[] {
      const supported = new Set<AgentCapability>(["structured-output", "tool-calls", "multi-turn-session"]);
      return requestedCapabilities.filter((capability) => supported.has(capability));
    },
  };
}