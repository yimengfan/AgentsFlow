import type { ProviderAdapter, PromptAssetManifest, ProviderPromptPackage, NodeConfigOverrides, RunInputData } from "@agentsflow/flow-schema";
import { BuiltInProviderAdapter, builtInAdapter } from "./provider-package.js";

/**
 * Global registry of ProviderAdapter instances.
 *
 * The built-in adapter is registered by default. Additional adapters
 * (Copilot, Claude, etc.) can be registered at startup or at runtime.
 *
 * Adapter resolution order:
 *   1. If `adapterKind` matches a registered adapter → use that adapter
 *   2. Fallback → built-in adapter
 *
 * IMPORTANT: Registration is global state. Tests that register custom
 * adapters MUST unregister them in cleanup to avoid cross-test pollution.
 */
export class ProviderAdapterRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  constructor() {
    // Register built-in adapter by default
    this.register(builtInAdapter);
  }

  /**
   * Register a provider adapter.
   * @throws if an adapter with the same adapterId is already registered
   */
  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.adapterId)) {
      throw new Error(
        `ProviderAdapter "${adapter.adapterId}" is already registered. Unregister it first.`,
      );
    }
    this.adapters.set(adapter.adapterId, adapter);
  }

  /**
   * Unregister a provider adapter by its adapterId.
   * The built-in adapter cannot be unregistered.
   */
  unregister(adapterId: string): void {
    if (adapterId === "built-in") {
      throw new Error("Cannot unregister the built-in provider adapter.");
    }
    this.adapters.delete(adapterId);
  }

  /**
   * Get a registered adapter by adapterId.
   */
  get(adapterId: string): ProviderAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Resolve an adapter for the given adapterKind.
   * Falls back to the built-in adapter if no match is found.
   */
  resolve(adapterKind: string): ProviderAdapter {
    return this.adapters.get(adapterKind) ?? builtInAdapter;
  }

  /**
   * Check if an adapter is registered for the given adapterId.
   */
  has(adapterId: string): boolean {
    return this.adapters.has(adapterId);
  }

  /**
   * List all registered adapter IDs.
   */
  listAdapterIds(): readonly string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Package a prompt using the appropriate adapter for the given adapterKind.
   *
   * @param adapterKind - The adapterKind from an agent definition or node config
   * @param agentId - The agentId from a `.agent.md` file
   * @param manifest - The resolved prompt asset manifest
   * @param nodeConfigOverrides - Optional node-level prompt overrides
   * @param runInput - Optional run-level input data
   * @returns A `ProviderPromptPackage`, or `undefined` if the agent is not found
   */
  packagePrompt(
    adapterKind: string,
    agentId: string,
    manifest: PromptAssetManifest,
    nodeConfigOverrides?: NodeConfigOverrides,
    runInput?: RunInputData,
  ): ProviderPromptPackage | undefined {
    const adapter = this.resolve(adapterKind);
    return adapter.packagePrompt(agentId, manifest, nodeConfigOverrides, runInput);
  }
}

// ---------------------------------------------------------------------------
// Default singleton registry
// ---------------------------------------------------------------------------

/** The default global adapter registry instance. */
export const defaultAdapterRegistry = new ProviderAdapterRegistry();
