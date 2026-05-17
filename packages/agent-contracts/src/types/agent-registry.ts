import type { AgentAdapter, AgentSession } from "./agent-adapter.js";
import type { AgentAdapterMetadata } from "./agent-adapter-metadata.js";

/**
 * Compatibility level between host and adapter.
 */
export type CompatibilityLevel =
  | "full"
  | "partial"
  | "incompatible";

/**
 * Result of a compatibility check.
 */
export interface CompatibilityResult {
  readonly level: CompatibilityLevel;
  readonly issues?: readonly string[];
  readonly missingCapabilities?: readonly string[];
}

/**
 * Factory function type for creating adapter instances.
 */
export type AgentAdapterFactory = (config?: unknown) => AgentAdapter | Promise<AgentAdapter>;

/**
 * AgentRegistry — the central registry for adapter discovery and instantiation.
 *
 * All adapters must be registered before the Flow Engine can use them.
 * The registry provides:
 *   - Adapter discovery (list all available adapters)
 *   - Adapter instantiation (get adapter by kind)
 *   - Compatibility checking (can this adapter work with this host version?)
 *   - Adapter registration (add new adapters at runtime)
 */
export interface AgentRegistry {
  /** Registry contract version */
  readonly registryVersion: string;

  /** List all registered adapter metadata */
  listAdapters(): readonly AgentAdapterMetadata[];

  /** Get an adapter instance by its kind (async because factory may be async) */
  getAdapter(adapterKind: string): Promise<AgentAdapter | undefined>;

  /** Check compatibility between host and an adapter */
  resolveCompatibility(hostVersion: string, adapterMetadata: AgentAdapterMetadata): CompatibilityResult;

  /** Register a new adapter with its factory */
  registerAdapter(metadata: AgentAdapterMetadata, factory: AgentAdapterFactory): void;
}
