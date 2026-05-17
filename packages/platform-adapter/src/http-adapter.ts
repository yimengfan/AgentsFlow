import type { PlatformApi } from "./platform-api.js";

/**
 * HTTP adapter — delegates to a REST API backend.
 *
 * In the web mode, the studio connects to a backend server
 * (e.g. Express/Hono) that provides the same operations as
 * Electron IPC but over HTTP.
 *
 * Default base URL: http://localhost:3000/api
 * Can be configured by passing baseUrl to createHttpAdapter(),
 * or via VITE_API_BASE_URL env variable in Vite-bundled apps.
 */

function getApiBase(): string {
  // In a Vite-bundled app, import.meta.env is available.
  // In a pure Node/TS context, it is not — so we guard with try/catch.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof import.meta !== "undefined") {
      const env = (import.meta as unknown as Record<string, unknown>).env;
      if (env && typeof env === "object" && "VITE_API_BASE_URL" in env) {
        return (env as Record<string, string>)["VITE_API_BASE_URL"]!;
      }
    }
  } catch {
    // import.meta not available (e.g. Jest/vitest)
  }
  return "http://localhost:3000/api";
}

const API_BASE = getApiBase();

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function createHttpAdapter(baseUrl?: string): PlatformApi {
  const base = baseUrl ?? API_BASE;

  return {
    platform: "web",

    flow: {
      list: () => request<readonly any[]>(`${base}/flows`),
      load: (flowPath) => request<string>(`${base}/flows/${encodeURIComponent(flowPath)}`),
      save: (flowPath, content) =>
        request<void>(`${base}/flows/${encodeURIComponent(flowPath)}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        }),
      validate: (content) =>
        request<{ valid: boolean; errors?: string[]; warnings?: string[] }>(
          `${base}/flows/validate`,
          {
            method: "POST",
            body: JSON.stringify({ content }),
          },
        ),
    },

    run: {
      start: (flowPath, input) =>
        request<{ runId: string }>(`${base}/runs`, {
          method: "POST",
          body: JSON.stringify({ flowPath, input }),
        }),
      pause: (runId) =>
        request<void>(`${base}/runs/${encodeURIComponent(runId)}/pause`, { method: "POST" }),
      resume: (runId) =>
        request<void>(`${base}/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" }),
      abort: (runId) =>
        request<void>(`${base}/runs/${encodeURIComponent(runId)}/abort`, { method: "POST" }),
      getStatus: (runId) =>
        request<any>(`${base}/runs/${encodeURIComponent(runId)}/status`),
    },

    agent: {
      listAdapters: () => request<readonly any[]>(`${base}/agents`),
      getAdapter: (adapterKind) =>
        request<any>(`${base}/agents/${encodeURIComponent(adapterKind)}`),
    },

    store: {
      query: (query, params) =>
        request<unknown>(`${base}/store/query`, {
          method: "POST",
          body: JSON.stringify({ query, params }),
        }),
      getRunEvents: (runId, limit) =>
        request<readonly any[]>(`${base}/store/runs/${encodeURIComponent(runId)}/events?limit=${limit ?? 100}`),
    },

    on: () => {
      // No real-time events in HTTP mode yet.
      // Future: WebSocket or SSE subscription.
      console.warn("Platform event subscriptions not available in web mode");
      return () => {};
    },
  };
}