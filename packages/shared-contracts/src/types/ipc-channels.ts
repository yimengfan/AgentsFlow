/**
 * IPC channel definitions for Electron main ↔ renderer communication.
 *
 * All channels are declared here with their input/output types.
 * The preload script exposes only these typed channels.
 */

/**
 * Request-response IPC channels (invoke/handle pattern).
 */
export interface IpcChannelMap {
  // Flow management
  "flow:list": { input: void; output: readonly FlowSummary[] };
  "flow:load": { input: { flowPath: string }; output: FlowSummary };
  "flow:save": { input: { flowPath: string; content: string }; output: void };
  "flow:validate": { input: { content: string }; output: ValidationResult };

  // Run management
  "run:start": { input: { flowPath: string }; output: { runId: string } };
  "run:pause": { input: { runId: string }; output: void };
  "run:resume": { input: { runId: string; resumeToken?: string }; output: void };
  "run:abort": { input: { runId: string }; output: void };
  "run:getStatus": { input: { runId: string }; output: RunStatus };

  // Agent registry
  "agent:listAdapters": { input: void; output: readonly AdapterSummary[] };
  "agent:getAdapter": { input: { adapterKind: string }; output: AdapterSummary | null };

  // Store
  "store:query": { input: { query: string; params?: readonly unknown[] }; output: unknown };
  "store:getRunEvents": { input: { runId: string; limit?: number }; output: readonly EventSummary[] };

  // Workspace management
  "workspace:openDialog": { input: void; output: string | null };
  "workspace:readDir": { input: { dirPath: string }; output: readonly DirEntry[] };
  "workspace:createFile": { input: { filePath: string; content: string }; output: void };
  "workspace:stat": { input: { path: string }; output: FileStat | null };
  "workspace:readFile": { input: { path: string }; output: FileContent | null };
}

/**
 * IPC channel type helper — extracts the channel name type.
 */
export type IpcChannel = keyof IpcChannelMap;

/**
 * Input type for a given IPC channel.
 */
export type IpcInput<C extends IpcChannel> = IpcChannelMap[C]["input"];

/**
 * Output type for a given IPC channel.
 */
export type IpcOutput<C extends IpcChannel> = IpcChannelMap[C]["output"];

// --- DTO types referenced by IPC channels ---

export interface FlowSummary {
  readonly flowPath: string;
  readonly name: string;
  readonly schemaVersion: string;
  readonly nodeCount: number;
  readonly agentCount: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface RunStatus {
  readonly runId: string;
  readonly state: "idle" | "running" | "paused" | "completed" | "failed" | "interrupted";
  readonly currentNodeId?: string;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface AdapterSummary {
  readonly adapterKind: string;
  readonly displayName: string;
  readonly adapterVersion: string;
  readonly contractVersion: string;
  readonly supportedCapabilities: readonly string[];
}

export interface EventSummary {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: number;
  readonly nodeId?: string;
  readonly agentId?: string;
}

// --- Workspace DTO types ---

/** A single entry in a directory listing (file or subdirectory). */
export interface DirEntry {
  /** Base name of the file or directory */
  readonly name: string;
  /** Absolute or workspace-relative path */
  readonly path: string;
  /** Whether this entry is a directory */
  readonly isDirectory: boolean;
  /** Whether this entry is a flow file (.yml or .yaml) */
  readonly isFlowFile: boolean;
}

/** File/directory metadata from stat(). */
export interface FileStat {
  /** Path that was stat'd */
  readonly path: string;
  /** Whether the path is a directory */
  readonly isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  readonly size: number;
  /** Last modification timestamp (ms since epoch) */
  readonly modifiedAt: number;
}

/** Content of a file read from the filesystem. */
export interface FileContent {
  /** The file content as a UTF-8 string (empty if binary). */
  readonly content: string;
  /** Whether the file appears to be binary (contains null bytes). */
  readonly isBinary: boolean;
}
