import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * SettingsStore — Zustand store for global application settings.
 *
 * OWNS: default model, transport, tool policy defaults, and other global preferences.
 * DOES NOT OWN: per-flow or per-node configuration (that belongs in flow schema / node config).
 *
 * Persistence: renderer-local localStorage only.
 */

/** Available model options for the model selector */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider?: string;
}

/** Default model list — can be extended via settings panel */
export const DEFAULT_MODEL_OPTIONS: readonly ModelOption[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek" },
  { id: "deepseek-v4", label: "DeepSeek V4", provider: "deepseek" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
  { id: "qwen3-235b-a22b", label: "Qwen3 235B", provider: "qwen" },
];

/** Transport type for agent communication */
export type TransportType = "http" | "pi-mono" | "custom";

/** Tool approval requirement */
export type ApprovalRequirement = "never" | "always" | "destructive_only";

export interface SettingsState {
  /** Default model ID for new agent nodes */
  defaultModelId: string;
  /** Default transport type */
  defaultTransport: TransportType;
  /** Default tool approval requirement */
  defaultApprovalRequirement: ApprovalRequirement;
  /** Whether to show advanced config fields in Inspector */
  showAdvancedConfig: boolean;
  /** Custom model options added by user */
  customModelOptions: readonly ModelOption[];
}

export interface SettingsActions {
  /** Set default model ID */
  setDefaultModelId: (modelId: string) => void;
  /** Set default transport type */
  setDefaultTransport: (transport: TransportType) => void;
  /** Set default tool approval requirement */
  setDefaultApprovalRequirement: (requirement: ApprovalRequirement) => void;
  /** Toggle advanced config visibility */
  toggleShowAdvancedConfig: () => void;
  /** Add a custom model option */
  addCustomModelOption: (option: ModelOption) => void;
  /** Remove a custom model option by ID */
  removeCustomModelOption: (id: string) => void;
  /** Get all model options (default + custom) */
  getAllModelOptions: () => readonly ModelOption[];
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      defaultModelId: "deepseek-v4-flash",
      defaultTransport: "http",
      defaultApprovalRequirement: "destructive_only",
      showAdvancedConfig: false,
      customModelOptions: [],

      setDefaultModelId: (modelId) => set({ defaultModelId: modelId }),
      setDefaultTransport: (transport) => set({ defaultTransport: transport }),
      setDefaultApprovalRequirement: (requirement) =>
        set({ defaultApprovalRequirement: requirement }),
      toggleShowAdvancedConfig: () =>
        set((s) => ({ showAdvancedConfig: !s.showAdvancedConfig })),
      addCustomModelOption: (option) =>
        set((s) => ({
          customModelOptions: [...s.customModelOptions, option],
        })),
      removeCustomModelOption: (id) =>
        set((s) => ({
          customModelOptions: s.customModelOptions.filter((o) => o.id !== id),
        })),
      getAllModelOptions: () => {
        const state = get();
        return [...DEFAULT_MODEL_OPTIONS, ...state.customModelOptions];
      },
    }),
    {
      name: "agentsflow-settings",
      partialize: (state) => ({
        defaultModelId: state.defaultModelId,
        defaultTransport: state.defaultTransport,
        defaultApprovalRequirement: state.defaultApprovalRequirement,
        showAdvancedConfig: state.showAdvancedConfig,
        customModelOptions: state.customModelOptions,
      }),
    },
  ),
);
