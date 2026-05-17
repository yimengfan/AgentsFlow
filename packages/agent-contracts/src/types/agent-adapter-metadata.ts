/**
 * Capabilities that an adapter may support.
 * Used for compatibility checks and feature gating.
 */
export type AgentCapability =
  | "streaming"
  | "structured-output"
  | "tool-calls"
  | "delegation-proposal"
  | "interrupt-resume"
  | "multi-turn-session"
  | "vision-input"
  | "code-interpreter";

/**
 * Static metadata describing an agent adapter.
 * Registered with AgentRegistry and displayed in UI.
 */
export interface AgentAdapterMetadata {
  /** Unique adapter identifier, e.g. "fake", "rpc", "ai-sdk", "openai-agents" */
  readonly adapterKind: string;

  /** Human-readable name for UI display */
  readonly displayName: string;

  /** Adapter implementation version */
  readonly adapterVersion: string;

  /** Contract version this adapter implements */
  readonly contractVersion: string;

  /** List of capabilities this adapter supports */
  readonly supportedCapabilities: readonly AgentCapability[];

  /** Reference to adapter-specific configuration schema (URI or pointer) */
  readonly configSchemaRef?: string;

  /** Known limitations for this adapter */
  readonly limitations?: readonly string[];
}
