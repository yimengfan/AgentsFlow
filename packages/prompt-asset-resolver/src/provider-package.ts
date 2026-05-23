import type {
  PromptAssetManifest,
  ResolvedAgentAsset,
  ProviderPromptPackage,
  ProviderAdapter,
  NodeConfigOverrides,
  RunInputData,
} from "@agentsflow/flow-schema";
import { assemblePromptPackage } from "./prompt-assembler.js";

// ---------------------------------------------------------------------------
// BuiltInProviderAdapter — AgentsFlow's own prompt packaging strategy
// ---------------------------------------------------------------------------

/**
 * The built-in provider adapter that uses AgentsFlow's 6-layer prompt
 * assembly (global-system-prompt → instructions → skills → agent body →
 * node config → run input).
 *
 * This is the default adapter. Future adapters (Copilot, Claude) will
 * implement the `ProviderAdapter` interface with provider-specific logic.
 */
export class BuiltInProviderAdapter implements ProviderAdapter {
  readonly adapterId = "built-in";

  packagePrompt(
    agentId: string,
    manifest: PromptAssetManifest,
    nodeConfigOverrides?: NodeConfigOverrides,
    runInput?: RunInputData,
  ): ProviderPromptPackage | undefined {
    const agent = manifest.agents.get(agentId);
    if (!agent) return undefined;

    return assemblePromptPackage(agent, manifest, nodeConfigOverrides, runInput);
  }

  isResolvable(agentId: string, manifest: PromptAssetManifest): boolean {
    if (!manifest.agents.has(agentId)) return false;
    for (const error of manifest.errors) {
      if (error.agentId === agentId) return false;
    }
    return true;
  }

  getDropdownItems(
    manifest: PromptAssetManifest,
  ): readonly {
    readonly agentId: string;
    readonly name: string;
    readonly description: string;
    readonly outputKind: string;
    readonly sourcePath: string;
    readonly hasErrors: boolean;
  }[] {
    const errorAgentIds = new Set<string>();
    for (const error of manifest.errors) {
      if (error.agentId) errorAgentIds.add(error.agentId);
    }

    const result: {
      agentId: string;
      name: string;
      description: string;
      outputKind: string;
      sourcePath: string;
      hasErrors: boolean;
    }[] = [];

    for (const agent of manifest.agents.values()) {
      result.push({
        agentId: agent.agentId,
        name: agent.name,
        description: agent.description,
        outputKind: agent.outputKind,
        sourcePath: agent.sourcePath,
        hasErrors: errorAgentIds.has(agent.agentId),
      });
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance for convenience
// ---------------------------------------------------------------------------

/** The default built-in adapter instance. */
export const builtInAdapter = new BuiltInProviderAdapter();

// ---------------------------------------------------------------------------
// Convenience functions (legacy API, delegates to BuiltInProviderAdapter)
// ---------------------------------------------------------------------------

/**
 * Build a `ProviderPromptPackage` for the built-in mode (AgentsFlow's own
 * prompt assembly).
 *
 * @deprecated Use `builtInAdapter.packagePrompt()` or `ProviderAdapterRegistry` instead.
 * This function remains for backward compatibility.
 */
export function packageForBuiltInMode(
  agentId: string,
  manifest: PromptAssetManifest,
  nodeConfigOverrides?: {
    readonly systemPrompt?: string;
    readonly userPrompt?: string;
  },
  runInput?: {
    readonly userPrompt?: string;
    readonly data?: string;
  },
): ProviderPromptPackage | undefined {
  return builtInAdapter.packagePrompt(agentId, manifest, nodeConfigOverrides, runInput);
}

/**
 * Check if an agentId exists in the manifest and has no associated errors.
 *
 * @deprecated Use `builtInAdapter.isResolvable()` instead.
 */
export function isAgentResolvable(
  agentId: string,
  manifest: PromptAssetManifest,
): boolean {
  return builtInAdapter.isResolvable(agentId, manifest);
}

/**
 * Get a list of all resolvable agent IDs from the manifest.
 * Useful for populating the agent binding dropdown in the UI.
 *
 * @deprecated Use `builtInAdapter.getDropdownItems()` instead.
 */
export function getResolvableAgentIds(
  manifest: PromptAssetManifest,
): readonly string[] {
  const items = builtInAdapter.getDropdownItems(manifest);
  return items.filter((i) => !i.hasErrors).map((i) => i.agentId);
}

/**
 * Get agent metadata for UI display (dropdown items).
 *
 * @deprecated Use `builtInAdapter.getDropdownItems()` instead.
 */
export function getAgentDropdownItems(
  manifest: PromptAssetManifest,
): readonly {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly outputKind: string;
  readonly sourcePath: string;
  readonly hasErrors: boolean;
}[] {
  return builtInAdapter.getDropdownItems(manifest);
}
