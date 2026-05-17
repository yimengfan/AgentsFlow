/**
 * Memory write operation type.
 */
export type MemoryWriteOperation = "append" | "replace" | "upsert" | "delete" | "tag";

/**
 * Visibility of a memory write — who can see it after commit.
 */
export type MemoryWriteVisibility =
  | "same-node"
  | "same-agent"
  | "same-run"
  | "global";

/**
 * MemoryWrite — a proposed write to the memory store.
 *
 * Adapters propose writes via MemoryFacade.proposeWrites().
 * The platform reviews and commits or rejects each write.
 */
export interface MemoryWrite {
  /** Unique write request ID */
  readonly writeId: string;

  /** Target memory scope */
  readonly targetScope: string;

  /** Write operation type */
  readonly operation: MemoryWriteOperation;

  /** Content to write */
  readonly content: unknown;

  /** Provenance: where this write came from */
  readonly provenance: {
    readonly nodeId: string;
    readonly agentId: string;
    readonly invocationId: string;
  };

  /** Who can see this write after commit */
  readonly visibility: MemoryWriteVisibility;

  /** Priority/importance (higher = more important) */
  readonly importance?: number;

  /** Tags for categorization */
  readonly tags?: readonly string[];
}
