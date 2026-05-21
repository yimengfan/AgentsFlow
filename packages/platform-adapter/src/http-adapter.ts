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

function getBrowserOrigin(): string | undefined {
  try {
    if (typeof globalThis === "object" && globalThis && "location" in globalThis) {
      const location = (globalThis as { location?: { origin?: unknown } }).location;
      if (typeof location?.origin === "string" && location.origin.length > 0) {
        return location.origin;
      }
    }
  } catch {
    // Browser globals not available.
  }

  return undefined;
}

function normalizeApiBase(baseUrl: string): string {
  if (/^https?:\/\//.test(baseUrl)) {
    return baseUrl;
  }

  if (baseUrl.startsWith("/")) {
    const origin = getBrowserOrigin();
    if (origin) {
      return `${origin}${baseUrl}`;
    }
  }

  return baseUrl;
}

function getApiBase(): string {
  // In a Vite-bundled app, import.meta.env is available.
  // In a pure Node/TS context, it is not — so we guard with try/catch.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof import.meta !== "undefined") {
      const env = (import.meta as unknown as Record<string, unknown>).env;
      if (env && typeof env === "object" && "VITE_API_BASE_URL" in env) {
        const envBase = (env as Record<string, string>)["VITE_API_BASE_URL"];
        if (typeof envBase === "string" && envBase.length > 0) {
          return normalizeApiBase(envBase);
        }
      }
    }
  } catch {
    // import.meta not available (e.g. Jest/vitest)
  }

  const browserOrigin = getBrowserOrigin();
  if (browserOrigin) {
    return `${browserOrigin}/api`;
  }

  return "http://localhost:3000/api";
}

const API_BASE = getApiBase();

export function createHttpAdapter(baseUrl?: string): PlatformApi {
  const base = baseUrl ?? API_BASE;

  async function request<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
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

  return {
    platform: "web",

    flow: {
      list: () => request<readonly any[]>(`/flows`),
      load: (flowPath) => request<string>(`/flows/${encodeURIComponent(flowPath)}`),
      save: (flowPath, content) =>
        request<void>(`/flows/${encodeURIComponent(flowPath)}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        }),
      validate: (content) =>
        request<{ valid: boolean; errors?: string[]; warnings?: string[] }>(
          `/flows/validate`,
          {
            method: "POST",
            body: JSON.stringify({ content }),
          },
        ),
    },

    run: {
      start: (flowPath, input) =>
        request<{ runId: string }>(`/runs`, {
          method: "POST",
          body: JSON.stringify({ flowPath, input }),
        }),
      pause: (runId) =>
        request<void>(`/runs/${encodeURIComponent(runId)}/pause`, { method: "POST" }),
      resume: (runId) =>
        request<void>(`/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" }),
      abort: (runId) =>
        request<void>(`/runs/${encodeURIComponent(runId)}/abort`, { method: "POST" }),
      getStatus: (runId) =>
        request<any>(`/runs/${encodeURIComponent(runId)}/status`),
    },

    agent: {
      listAdapters: () => request<readonly any[]>(`/agents`),
      getAdapter: (adapterKind) =>
        request<any>(`/agents/${encodeURIComponent(adapterKind)}`),
    },

    store: {
      query: (query, params) =>
        request<unknown>(`/store/query`, {
          method: "POST",
          body: JSON.stringify({ query, params }),
        }),
      getRunEvents: (runId, limit) =>
        request<readonly any[]>(`/store/runs/${encodeURIComponent(runId)}/events?limit=${limit ?? 100}`),
    },

    workspace: {
      openDialog: () => request<string | null>("/workspace/open-dialog", { method: "POST" }),
      readDir: (dirPath) =>
        request<readonly any[]>(`/workspace/read-dir?path=${encodeURIComponent(dirPath)}`),
      createFile: (filePath, content) =>
        request<void>("/workspace/create-file", {
          method: "POST",
          body: JSON.stringify({ filePath, content }),
        }),
      stat: (path) =>
        request<any | null>(`/workspace/stat?path=${encodeURIComponent(path)}`),
      readFile: (path) =>
        request<any | null>(`/workspace/read-file?path=${encodeURIComponent(path)}`),
      suggestPaths: () =>
        request<readonly { name: string; path: string }[]>("/workspace/suggest-paths"),
    },

    on: () => {
      // No real-time events in HTTP mode yet.
      // Future: WebSocket or SSE subscription.
      console.warn("Platform event subscriptions not available in web mode");
      return () => {};
    },
  };
}