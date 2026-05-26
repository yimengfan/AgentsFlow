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
 * Strategy:
 * 1. Match by tag (case-insensitive contains).
 * 2. If no tag match, try matching by baseUrl hostname heuristic.
 * 3. If still no match, fall back to the first provider with an apiKey.
 * Falls back to env vars if no matching provider is found.
 */
function resolveProviderConfig(adapterKind: string): { baseUrl?: string; apiKey?: string; model?: string } {
  const { providers, defaultModelKey } = useSettingsStore.getState();

  if (providers.length === 0) {
    return {};
  }

  // Map adapter kind to provider tag heuristic
  const tagHint = adapterKind === "deepseek" ? "deepseek" : adapterKind;

  // 1. Try tag match (case-insensitive contains)
  let matchingProvider = providers.find((p) =>
    p.tag.toLowerCase() === tagHint.toLowerCase()
    || p.tag.toLowerCase().includes(tagHint.toLowerCase())
  );

  // 2. If no tag match, try baseUrl hostname heuristic
  if (!matchingProvider) {
    matchingProvider = providers.find((p) => {
      try {
        const hostname = new URL(p.baseUrl).hostname.toLowerCase();
        return hostname.includes(tagHint.toLowerCase());
      } catch {
        return false;
      }
    });
  }

  // 3. If still no match, fall back to the first provider that has an apiKey or baseUrl
  if (!matchingProvider) {
    matchingProvider = providers.find((p) => p.apiKey || p.baseUrl)
      ?? providers[0];
  }

  if (!matchingProvider) {
    return {};
  }

  // Extract model from defaultModelKey using case-insensitive tag prefix match
  let model: string | undefined;
  if (defaultModelKey) {
    const slashIdx = defaultModelKey.indexOf("/");
    if (slashIdx !== -1) {
      const keyTag = defaultModelKey.slice(0, slashIdx);
      const keyModel = defaultModelKey.slice(slashIdx + 1);
      // Case-insensitive tag prefix match
      if (keyTag.toLowerCase() === matchingProvider.tag.toLowerCase()) {
        model = keyModel;
      }
    }
  }

  return {
    baseUrl: matchingProvider.baseUrl,
    apiKey: matchingProvider.apiKey,
    ...(model !== undefined ? { model } : {}),
  };
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
      // pi-mono primarily uses deepseek transport, but also try the adapterKind itself
      // so that users who tag their provider as "pi-mono" can find it
      const providerConfig = resolveProviderConfig("pi-mono");
      // If pi-mono tag didn't match, fall back to deepseek tag heuristic
      const finalConfig = providerConfig.apiKey || providerConfig.baseUrl
        ? providerConfig
        : resolveProviderConfig("deepseek");
      return new PiMonoAgentAdapter({
        flowName: flow.meta.name,
        ...(agentDef.modelProfile?.model !== undefined ? { model: agentDef.modelProfile.model } : {}),
        ...(agentDef.modelProfile?.temperature !== undefined ? { temperature: agentDef.modelProfile.temperature } : {}),
        ...(agentDef.adapterConfig !== undefined ? { adapterConfig: agentDef.adapterConfig } : {}),
        // Inject settings store provider config if available
        ...(finalConfig.baseUrl ? { baseUrl: finalConfig.baseUrl } : {}),
        ...(finalConfig.apiKey ? { apiKey: finalConfig.apiKey } : {}),
        ...(finalConfig.model ? { model: finalConfig.model } : {}),
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
