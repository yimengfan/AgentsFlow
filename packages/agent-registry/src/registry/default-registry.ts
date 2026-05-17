import type {
  AgentAdapter,
  AgentAdapterMetadata,
  AgentRegistry,
  AgentAdapterFactory,
  CompatibilityResult,
} from "@agentsflow/agent-contracts";

/**
 * DefaultAgentRegistry — in-memory registry for agent adapters.
 *
 * Responsibilities:
 *   - Register adapter factories keyed by adapterKind
 *   - Look up adapters by kind
 *   - Check compatibility between flow requirements and adapter capabilities
 *   - List all registered adapters with their metadata
 */
export class DefaultAgentRegistry implements AgentRegistry {
  readonly registryVersion = "1.0";

  private factories: Map<string, AgentAdapterFactory> = new Map();
  private metadataCache: Map<string, AgentAdapterMetadata> = new Map();
  private instanceCache: Map<string, AgentAdapter> = new Map();

  /**
   * Register an adapter factory with its metadata.
   * If a factory for the same adapterKind already exists, it is replaced.
   */
  registerAdapter(metadata: AgentAdapterMetadata, factory: AgentAdapterFactory): void {
    this.factories.set(metadata.adapterKind, factory);
    this.metadataCache.set(metadata.adapterKind, metadata);
    // Invalidate cached instance so next getAdapter creates fresh
    this.instanceCache.delete(metadata.adapterKind);
  }

  /**
   * Get a cached adapter instance for the given kind.
   * Creates one if not yet instantiated.
   * Async because the factory may return a Promise.
   */
  async getAdapter(adapterKind: string): Promise<AgentAdapter | undefined> {
    const cached = this.instanceCache.get(adapterKind);
    if (cached) return cached;

    const factory = this.factories.get(adapterKind);
    if (!factory) return undefined;

    const adapter = await factory();
    this.instanceCache.set(adapterKind, adapter);
    return adapter;
  }

  /**
   * List all registered adapter metadata.
   */
  listAdapters(): readonly AgentAdapterMetadata[] {
    return Array.from(this.metadataCache.values());
  }

  /**
   * Check compatibility between a host version and an adapter's metadata.
   */
  resolveCompatibility(
    hostVersion: string,
    adapterMetadata: AgentAdapterMetadata,
  ): CompatibilityResult {
    // Compare contract versions (simple semver major match)
    const hostMajor = hostVersion.split(".")[0];
    const adapterMajor = adapterMetadata.contractVersion.split(".")[0];

    if (hostMajor !== adapterMajor) {
      return {
        level: "incompatible",
        issues: [`Contract version mismatch: host=${hostVersion}, adapter=${adapterMetadata.contractVersion}`],
        missingCapabilities: [],
      };
    }

    // Check for limitations
    const hasLimitations = adapterMetadata.limitations && adapterMetadata.limitations.length > 0;

    return {
      level: hasLimitations ? "partial" : "full",
      ...(hasLimitations ? { issues: [...adapterMetadata.limitations!] } : {}),
      missingCapabilities: [],
    };
  }

  /**
   * Unregister an adapter by kind.
   */
  unregisterAdapter(adapterKind: string): boolean {
    const deleted = this.factories.delete(adapterKind);
    this.metadataCache.delete(adapterKind);
    this.instanceCache.delete(adapterKind);
    return deleted;
  }

  /**
   * Clear all registered adapters.
   */
  clear(): void {
    this.factories.clear();
    this.metadataCache.clear();
    this.instanceCache.clear();
  }
}
