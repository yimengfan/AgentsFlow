import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * SettingsStore — Zustand store for global application settings.
 *
 * OWNS: LLM provider endpoints, model registry, default model selection,
 * tool approval policy, and settings tab state.
 * DOES NOT OWN: per-flow or per-node configuration (that belongs in flow schema / node config).
 *
 * Persistence: renderer-local localStorage only.
 */

// ─── LLM Protocol ──────────────────────────────────────────

/** LLM API protocol format — determines how models are discovered and chat requests are made */
export type LlmProtocol = "openai" | "anthropic";

// ─── LLM Provider ──────────────────────────────────────────

/** A registered LLM provider endpoint */
export interface LlmProvider {
  /** Unique identifier (auto-generated UUID) */
  readonly id: string;
  /** User-editable tag/label, defaults to hostname */
  readonly tag: string;
  /** Base URL for the API endpoint (e.g. "https://api.deepseek.com") */
  readonly baseUrl: string;
  /** API key (optional — empty for local endpoints like Ollama) */
  readonly apiKey: string;
  /** Protocol format */
  readonly protocol: LlmProtocol;
  /** Models fetched from /v1/models or manually added */
  readonly models: readonly LlmModel[];
  /** Last error from model fetch, if any */
  readonly lastFetchError: string | null;
  /** Timestamp of last successful model fetch */
  readonly lastFetchedAt: number | null;
}

/** A model available under a provider */
export interface LlmModel {
  /** Model ID from the provider (e.g. "deepseek-v4-flash") */
  readonly id: string;
  /** Display name */
  readonly label: string;
  /** Back-reference to LlmProvider.id */
  readonly providerId: string;
}

// ─── Tool Policy ───────────────────────────────────────────

/** Tool approval requirement */
export type ApprovalRequirement = "never" | "always" | "destructive_only";

// ─── Settings Tab ──────────────────────────────────────────

/** Settings panel sub-tab identifiers */
export type SettingsTab = "llm" | "tools" | "mcp";

// ─── State & Actions ───────────────────────────────────────

export interface SettingsState {
  /** Registered LLM providers */
  readonly providers: readonly LlmProvider[];
  /** Default model composite key: "providerTag/modelId" or null */
  readonly defaultModelKey: string | null;
  /** Default tool approval requirement */
  readonly defaultApprovalRequirement: ApprovalRequirement;
  /** Active settings sub-tab */
  readonly activeSettingsTab: SettingsTab;
}

export interface SettingsActions {
  // ── Provider CRUD ──
  /** Add a new provider. Returns the generated provider ID. */
  addProvider: (input: { tag: string; baseUrl: string; apiKey: string; protocol: LlmProtocol }) => string;
  /** Update a provider's mutable fields */
  updateProvider: (id: string, patch: Partial<Omit<LlmProvider, "id">>) => void;
  /** Remove a provider by ID */
  removeProvider: (id: string) => void;

  // ── Model management ──
  /** Set models for a provider (after fetch or manual add) */
  setProviderModels: (providerId: string, models: readonly LlmModel[], error?: string | null) => void;
  /** Add a manual model to a provider */
  addManualModel: (providerId: string, model: { id: string; label: string }) => void;
  /** Remove a model from a provider */
  removeModel: (providerId: string, modelId: string) => void;

  // ── Default model ──
  /** Set default model by composite key "providerTag/modelId" */
  setDefaultModelKey: (key: string | null) => void;
  /** Get all models across all providers */
  getAllModels: () => readonly LlmModel[];

  // ── Tab ──
  /** Switch active settings sub-tab */
  setActiveSettingsTab: (tab: SettingsTab) => void;

  // ── Tool policy ──
  /** Set default tool approval requirement */
  setDefaultApprovalRequirement: (requirement: ApprovalRequirement) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

// ─── Helpers ───────────────────────────────────────────────

/** Generate a simple unique ID (no crypto dependency needed) */
function generateId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Extract hostname from a URL for default tag */
function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Migration ─────────────────────────────────────────────

/**
 * Detect and migrate old schema (defaultModelId without providers).
 * Returns a partial state patch to merge, or null if no migration needed.
 */
function migrateFromOldSchema(persisted: Record<string, unknown>): Partial<SettingsState> | null {
  // Old schema has defaultModelId but no providers
  if ("defaultModelId" in persisted && !("providers" in persisted)) {
    const oldModelId = typeof persisted.defaultModelId === "string"
      ? persisted.defaultModelId
      : "deepseek-v4-flash";

    // Create a default provider from env-style defaults
    const defaultProvider: LlmProvider = {
      id: generateId(),
      tag: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      protocol: "openai",
      models: [
        { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", providerId: "" },
        { id: "deepseek-v4", label: "DeepSeek V4", providerId: "" },
        { id: "gpt-4o", label: "GPT-4o", providerId: "" },
        { id: "gpt-4o-mini", label: "GPT-4o Mini", providerId: "" },
        { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", providerId: "" },
        { id: "qwen3-235b-a22b", label: "Qwen3 235B", providerId: "" },
      ].map((m) => ({ ...m, providerId: "" })), // will be fixed below
      lastFetchError: null,
      lastFetchedAt: null,
    };

    // Fix providerId references
    const fixedModels = defaultProvider.models.map((m) => ({
      ...m,
      providerId: defaultProvider.id,
    }));

    const migratedProvider = { ...defaultProvider, models: fixedModels };

    // Migrate old customModelOptions if present
    const oldCustom = persisted.customModelOptions;
    let extraModels: readonly LlmModel[] = [];
    if (Array.isArray(oldCustom)) {
      extraModels = oldCustom
        .filter((item): item is { id: string; label: string; provider?: string } =>
          typeof item === "object" && item !== null && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          label: item.label ?? item.id,
          providerId: migratedProvider.id,
        }));
    }

    const finalProvider = {
      ...migratedProvider,
      models: [...migratedProvider.models, ...extraModels],
    };

    // Build defaultModelKey
    const defaultModelKey = `deepseek/${oldModelId}`;

    return {
      providers: [finalProvider],
      defaultModelKey,
      defaultApprovalRequirement: typeof persisted.defaultApprovalRequirement === "string"
        ? (persisted.defaultApprovalRequirement as ApprovalRequirement)
        : "destructive_only",
      activeSettingsTab: "llm",
    };
  }

  return null;
}

// ─── Store ─────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      providers: [],
      defaultModelKey: null,
      defaultApprovalRequirement: "destructive_only",
      activeSettingsTab: "llm",

      // ── Provider CRUD ──

      addProvider: (input) => {
        const id = generateId();
        const tag = input.tag.trim() || hostnameFromUrl(input.baseUrl);
        const provider: LlmProvider = {
          id,
          tag,
          baseUrl: input.baseUrl.trim(),
          apiKey: input.apiKey,
          protocol: input.protocol,
          models: [],
          lastFetchError: null,
          lastFetchedAt: null,
        };
        set((s) => ({ providers: [...s.providers, provider] }));
        return id;
      },

      updateProvider: (id, patch) => {
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        }));
      },

      removeProvider: (id) => {
        set((s) => {
          const provider = s.providers.find((p) => p.id === id);
          const newProviders = s.providers.filter((p) => p.id !== id);
          // Clear defaultModelKey if it referenced this provider
          let newKey = s.defaultModelKey;
          if (provider && newKey?.startsWith(`${provider.tag}/`)) {
            newKey = null;
          }
          return { providers: newProviders, defaultModelKey: newKey };
        });
      },

      // ── Model management ──

      setProviderModels: (providerId, models, error) => {
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  models,
                  lastFetchError: error ?? null,
                  lastFetchedAt: error ? p.lastFetchedAt : Date.now(),
                }
              : p
          ),
        }));
      },

      addManualModel: (providerId, model) => {
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  models: [...p.models, { ...model, providerId }],
                }
              : p
          ),
        }));
      },

      removeModel: (providerId, modelId) => {
        set((s) => {
          const provider = s.providers.find((p) => p.id === providerId);
          const newProviders = s.providers.map((p) =>
            p.id === providerId
              ? { ...p, models: p.models.filter((m) => m.id !== modelId) }
              : p
          );
          // Clear defaultModelKey if it referenced this model
          let newKey = s.defaultModelKey;
          if (provider && newKey === `${provider.tag}/${modelId}`) {
            newKey = null;
          }
          return { providers: newProviders, defaultModelKey: newKey };
        });
      },

      // ── Default model ──

      setDefaultModelKey: (key) => set({ defaultModelKey: key }),

      getAllModels: () => {
        const state = get();
        return state.providers.flatMap((p) => p.models);
      },

      // ── Tab ──

      setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

      // ── Tool policy ──

      setDefaultApprovalRequirement: (requirement) =>
        set({ defaultApprovalRequirement: requirement }),
    }),
    {
      name: "agentsflow-settings",
      partialize: (state) => ({
        providers: state.providers,
        defaultModelKey: state.defaultModelKey,
        defaultApprovalRequirement: state.defaultApprovalRequirement,
        activeSettingsTab: state.activeSettingsTab,
      }),
      // Migration: merge old schema into new on hydration
      merge: (persisted, current) => {
        const persistedRecord = persisted as Record<string, unknown>;
        const migration = migrateFromOldSchema(persistedRecord);
        if (migration) {
          return { ...current, ...migration };
        }
        // Normal merge: persisted values override defaults
        return { ...current, ...(persisted as Partial<SettingsState>) };
      },
    },
  ),
);
