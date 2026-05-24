/**
 * LLM Model Fetcher — fetches available models from a provider's /v1/models endpoint.
 *
 * Supports OpenAI-compatible API protocol. Anthropic protocol support is
 * deferred — the data model is ready but the fetch logic is not implemented yet.
 */

import type { LlmModel, LlmProtocol, LlmProvider } from "../store/settings-store.js";

// ─── URL Normalization ─────────────────────────────────────

/**
 * Normalize a base URL for model fetching:
 * - Strip trailing slashes
 * - Avoid double /v1 (e.g. "https://api.openai.com/v1" should not become "/v1/v1/models")
 */
function normalizeModelsUrl(baseUrl: string): string {
  let url = baseUrl.replace(/\/+$/, "");
  // If URL already ends with /v1, use it as-is; otherwise append /v1
  if (!url.endsWith("/v1")) {
    url = `${url}/v1`;
  }
  return `${url}/models`;
}

// ─── OpenAI /v1/models Response ────────────────────────────

interface OpenAIModelsResponse {
  readonly data?: ReadonlyArray<{
    readonly id: string;
    readonly object?: string;
    readonly created?: number;
    readonly owned_by?: string;
  }>;
  readonly error?: {
    readonly message?: string;
  };
}

// ─── Fetch Result ──────────────────────────────────────────

export interface FetchModelsResult {
  /** Fetched models (empty on error) */
  readonly models: readonly LlmModel[];
  /** Error message if fetch failed, null on success */
  readonly error: string | null;
}

// ─── Public API ────────────────────────────────────────────

/**
 * Fetch available models for a provider using its configured protocol.
 *
 * @param provider The LLM provider to fetch models for
 * @returns FetchModelsResult with models array and optional error message
 */
export async function fetchModelsForProvider(provider: LlmProvider): Promise<FetchModelsResult> {
  if (provider.protocol === "openai") {
    return fetchOpenAIModels(provider);
  }

  // Anthropic protocol: not yet implemented
  if (provider.protocol === "anthropic") {
    return {
      models: [],
      error: "Anthropic model fetching is not yet supported. Please add models manually.",
    };
  }

  // Exhaustive check — should never reach here if LlmProtocol is a union type
  const _exhaustive: never = provider.protocol;
  return {
    models: [],
    error: `Unsupported protocol: ${String(_exhaustive)}`,
  };
}

// ─── OpenAI Implementation ─────────────────────────────────

async function fetchOpenAIModels(provider: LlmProvider): Promise<FetchModelsResult> {
  const url = normalizeModelsUrl(provider.baseUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add auth header only if apiKey is non-empty (Ollama etc. don't need auth)
  if (provider.apiKey.trim().length > 0) {
    headers["Authorization"] = `Bearer ${provider.apiKey.trim()}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        models: [],
        error: `HTTP ${response.status}: ${response.statusText}${errorText ? ` — ${errorText.slice(0, 200)}` : ""}`,
      };
    }

    const payload = await response.json() as OpenAIModelsResponse;

    if (payload.error?.message) {
      return {
        models: [],
        error: payload.error.message,
      };
    }

    if (!Array.isArray(payload.data)) {
      return {
        models: [],
        error: "Invalid response: missing 'data' array.",
      };
    }

    const models: LlmModel[] = payload.data
      .filter((item) => typeof item.id === "string" && item.id.trim().length > 0)
      .map((item) => ({
        id: item.id,
        label: item.id, // Use model ID as label (provider doesn't always give a friendly name)
        providerId: provider.id,
      }));

    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      models: [],
      error: `Fetch failed: ${message}`,
    };
  }
}
