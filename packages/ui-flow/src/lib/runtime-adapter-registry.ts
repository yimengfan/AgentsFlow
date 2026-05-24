import type { AgentAdapter } from "@agentsflow/agent-contracts";
import type { AgentDef, FlowDefinition } from "@agentsflow/flow-schema";
import { PiMonoAgentAdapter } from "@agentsflow/pi-mono-runtime";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";
import { DeepSeekChatAdapter } from "./deepseek-chat-adapter.js";
import { useSettingsStore } from "../store/settings-store.js";

export interface RuntimeAdapterExtensionContext {
  readonly flow: FlowDefinition;
  readonly agentDef: AgentDef;
}

export interface RuntimeAdapterExtension {
  readonly adapterKind: string;
  readonly displayName: string;
  createAdapter(context: RuntimeAdapterExtensionContext): Promise<AgentAdapter> | AgentAdapter;
}

const runtimeAdapterExtensions = new Map<string, RuntimeAdapterExtension>();
let builtinExtensionsRegistered = false;

/**
 * Resolve provider config from settings store for a given adapter kind.
 * Falls back to env vars if no matching provider is found.
 */
function resolveProviderConfig(adapterKind: string): { baseUrl?: string; apiKey?: string; model?: string } {
  const providers = useSettingsStore.getState().providers;
  // Map adapter kind to provider tag heuristic
  const tagHint = adapterKind === "deepseek" ? "deepseek" : adapterKind;
  const matchingProvider = providers.find((p) =>
    p.tag.toLowerCase() === tagHint.toLowerCase()
    || p.tag.toLowerCase().includes(tagHint.toLowerCase())
  );

  if (matchingProvider) {
    // Use composite defaultModelKey to extract model
    const defaultKey = useSettingsStore.getState().defaultModelKey;
    let model: string | undefined;
    if (defaultKey && defaultKey.startsWith(`${matchingProvider.tag}/`)) {
      model = defaultKey.slice(matchingProvider.tag.length + 1);
    }
    return {
      baseUrl: matchingProvider.baseUrl,
      apiKey: matchingProvider.apiKey,
      ...(model !== undefined ? { model } : {}),
    };
  }

  // No matching provider — fall back to env vars (DeepSeekChatAdapter resolves internally)
  return {};
}

function ensureBuiltinExtensions(): void {
  if (builtinExtensionsRegistered) {
    return;
  }

  builtinExtensionsRegistered = true;
  registerRuntimeAdapterExtension({
    adapterKind: "fake",
    displayName: "Fake Adapter (UI Runtime)",
    createAdapter: () =>
      new FakeAgentAdapter({
        evaluateScoreProgression: [0.42, 0.68, 0.91],
      }),
  });
  registerRuntimeAdapterExtension({
    adapterKind: "deepseek",
    displayName: "DeepSeek Chat",
    createAdapter: () => {
      const providerConfig = resolveProviderConfig("deepseek");
      return new DeepSeekChatAdapter({
        ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
        ...(providerConfig.apiKey ? { apiKey: providerConfig.apiKey } : {}),
        ...(providerConfig.model ? { model: providerConfig.model } : {}),
      });
    },
  });
  registerRuntimeAdapterExtension({
    adapterKind: "pi-mono",
    displayName: "pi-mono",
    createAdapter: ({ flow, agentDef }) => {
      const providerConfig = resolveProviderConfig("deepseek");
      return new PiMonoAgentAdapter({
        flowName: flow.meta.name,
        ...(agentDef.modelProfile?.model !== undefined ? { model: agentDef.modelProfile.model } : {}),
        ...(agentDef.modelProfile?.temperature !== undefined ? { temperature: agentDef.modelProfile.temperature } : {}),
        ...(agentDef.adapterConfig !== undefined ? { adapterConfig: agentDef.adapterConfig } : {}),
        // Inject settings store provider config if available
        ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
        ...(providerConfig.apiKey ? { apiKey: providerConfig.apiKey } : {}),
        ...(providerConfig.model ? { model: providerConfig.model } : {}),
      });
    },
  });
}

export function registerRuntimeAdapterExtension(extension: RuntimeAdapterExtension): void {
  runtimeAdapterExtensions.set(extension.adapterKind, extension);
}

export function unregisterRuntimeAdapterExtension(adapterKind: string): boolean {
  return runtimeAdapterExtensions.delete(adapterKind);
}

export function listRuntimeAdapterExtensions(): readonly RuntimeAdapterExtension[] {
  ensureBuiltinExtensions();
  return [...runtimeAdapterExtensions.values()];
}

export async function resolveRuntimeAdapter(
  flow: FlowDefinition,
  agentDef: AgentDef,
): Promise<AgentAdapter> {
  ensureBuiltinExtensions();
  const extension = runtimeAdapterExtensions.get(agentDef.adapterKind);

  if (!extension) {
    throw new Error(
      `Adapter "${agentDef.adapterKind}" is not registered in the local runtime. Register an extension, e.g. @agentsflow/pi-mono-runtime, before running this flow.`,
    );
  }

  return extension.createAdapter({ flow, agentDef });
}
