/**
 * Error categories for the AgentsFlow platform.
 */
export type ErrorCategory =
  | "adapter"
  | "engine"
  | "schema"
  | "store"
  | "ipc"
  | "validation"
  | "budget"
  | "timeout"
  | "unknown";

/**
 * Well-known error codes.
 * Format: CATEGORY_SPECIFIC_ERROR
 */
export type ErrorCode =
  | "ADAPTER_NOT_FOUND"
  | "ADAPTER_INIT_FAILED"
  | "ADAPTER_TURN_FAILED"
  | "ENGINE_FLOW_NOT_FOUND"
  | "ENGINE_EXECUTION_ERROR"
  | "ENGINE_BUDGET_EXCEEDED"
  | "ENGINE_TIMEOUT"
  | "ENGINE_INTERRUPTED"
  | "SCHEMA_VALIDATION_FAILED"
  | "SCHEMA_MIGRATION_REQUIRED"
  | "SCHEMA_VERSION_MISMATCH"
  | "STORE_CONNECTION_FAILED"
  | "STORE_QUERY_FAILED"
  | "IPC_CHANNEL_NOT_FOUND"
  | "IPC_HANDLER_ERROR"
  | "VALIDATION_CONFIG_INVALID"
  | "VALIDATION_CONSTRAINT_VIOLATION"
  | "UNKNOWN";

/**
 * Structured platform error.
 */
export interface PlatformError {
  /** Machine-readable error code */
  readonly code: ErrorCode;
  /** Error category */
  readonly category: ErrorCategory;
  /** Human-readable message */
  readonly message: string;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Additional context */
  readonly details?: Record<string, unknown>;
  /** Original error (for chaining, not serialized across IPC) */
  readonly cause?: Error;
}
