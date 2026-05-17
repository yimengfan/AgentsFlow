/**
 * Memory scope names. Platform-managed, agents access via MemoryFacade.
 */
export type MemoryScope =
  | "session"
  | "run"
  | "node"
  | "agent-local"
  | "artifacts";

/**
 * Retention policy for a memory scope.
 */
export interface RetentionPolicy {
  /** How long items persist (ms), 0 = ephemeral */
  readonly ttlMs?: number;
  /** Maximum number of items */
  readonly maxItems?: number;
  /** Maximum total bytes */
  readonly maxBytes?: number;
}

/**
 * Redaction rule for sensitive data in memory.
 */
export interface RedactRule {
  /** Pattern to match (regex or glob) */
  readonly pattern: string;
  /** Replacement text */
  readonly replacement: string;
  /** Which scopes this rule applies to */
  readonly scopes?: readonly string[];
}

/**
 * MemoryScopePolicy — governs what memory an agent can see and modify.
 *
 * Constructed by the platform per-invocation based on:
 *   - The agent's memoryPolicy from flow YAML
 *   - The node's memoryPolicy overrides
 *   - The current runtime context
 */
export interface MemoryScopePolicy {
  /** Scopes the current node can read from */
  readonly visibleScopes: readonly MemoryScope[];

  /** Scopes the current node can propose writes to */
  readonly writableScopes: readonly MemoryScope[];

  /** Maximum number of items exposed in a single read */
  readonly maxItems?: number;

  /** Maximum bytes exposed in a single read */
  readonly maxBytes?: number;

  /** Data redaction rules */
  readonly redactRules?: readonly RedactRule[];

  /** Retention policy per scope */
  readonly retentionPolicy?: Partial<Record<MemoryScope, RetentionPolicy>>;
}
