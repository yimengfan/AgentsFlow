/**
 * Memory read query parameters.
 */
export interface MemoryReadQuery {
  /** Scope to read from */
  readonly scope: string;
  /** Key prefix or glob pattern */
  readonly key?: string;
  /** Maximum number of items to return */
  readonly limit?: number;
  /** Offset for pagination */
  readonly offset?: number;
}

/**
 * Memory search query parameters.
 */
export interface MemorySearchQuery {
  /** Scopes to search within */
  readonly scopes: readonly string[];
  /** Search text or pattern */
  readonly query: string;
  /** Maximum number of results */
  readonly limit?: number;
}

/**
 * Decision from the platform on proposed memory writes.
 */
export type MemoryWriteDecision =
  | "approved"
  | "rejected"
  | "modified";

/**
 * MemoryFacade — controlled interface for agents to access memory.
 *
 * Invariants:
 *   - Agents can only read from scopes they have visibility for
 *   - Agents can only PROPOSE writes; the platform decides whether to commit
 *   - Direct filesystem/SQLite access is prohibited
 *
 * The platform constructs a scoped MemoryFacade for each invocation,
 * applying the MemoryScopePolicy to gate access.
 */
export interface MemoryFacade {
  /** Contract version */
  readonly memoryVersion: string;

  /** Scopes currently visible to this facade */
  readonly scopes: readonly string[];

  /**
   * Read memory items from a scope.
   * Only scopes listed in `scopes` are accessible.
   */
  read(query: MemoryReadQuery): Promise<readonly MemoryItem[]>;

  /**
   * Search across visible scopes.
   */
  search(query: MemorySearchQuery): Promise<readonly MemoryItem[]>;

  /**
   * List items in a scope.
   */
  list(scope: string): Promise<readonly MemoryItem[]>;

  /**
   * Propose memory writes. The platform will review and decide.
   * Returns the decision for each proposed write.
   */
  proposeWrites(changes: readonly import("./memory-write.js").MemoryWrite[]): Promise<readonly MemoryWriteDecision[]>;

  /**
   * Commit writes after platform approval.
   * Called by the flow engine, not directly by adapters.
   */
  commitWrites(changes: readonly import("./memory-write.js").MemoryWrite[], decision: MemoryWriteDecision): Promise<void>;

  /**
   * Take a snapshot of the current memory state for debugging/replay.
   */
  snapshot(scopeSet?: readonly string[]): Promise<MemorySnapshot>;
}

/**
 * A single memory item.
 */
export interface MemoryItem {
  readonly key: string;
  readonly scope: string;
  readonly content: unknown;
  readonly tags?: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * A memory snapshot for debugging/replay.
 */
export interface MemorySnapshot {
  readonly snapshotId: string;
  readonly timestamp: number;
  readonly scopes: readonly string[];
  readonly items: readonly MemoryItem[];
}
