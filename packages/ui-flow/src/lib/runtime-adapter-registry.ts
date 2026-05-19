import type { AgentAdapter } from "@agentsflow/agent-contracts";
import type { AgentDef, FlowDefinition } from "@agentsflow/flow-schema";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";

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
