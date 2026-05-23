/**
 * PlatformApi — the unified interface for platform operations.
 *
 * Both Electron IPC and HTTP REST backends implement this same interface.
 * UI components call these methods without knowing the underlying transport.
 */

import type { PromptAssetManifest } from "@agentsflow/flow-schema";

export interface FlowApi {
  list(workspacePath: string): Promise<readonly FlowSummary[]>;
  load(flowPath: string): Promise<string>;
  save(flowPath: string, content: string): Promise<void>;
  validate(content: string): Promise<ValidationResult>;
}

export interface RunApi {
  start(flowPath: string, input?: Record<string, unknown>): Promise<{ runId: string }>;
  pause(runId: string): Promise<void>;
  resume(runId: string, resumeToken?: string): Promise<void>;
  abort(runId: string): Promise<void>;
  getStatus(runId: string): Promise<RunStatus>;
}

export interface AgentApi {
  listAdapters(): Promise<readonly AdapterSummary[]>;
  getAdapter(adapterKind: string): Promise<AdapterSummary | null>;
}

export interface StoreApi {
  query(query: string, params?: readonly unknown[]): Promise<unknown>;
  getRunEvents(runId: string, limit?: number): Promise<readonly EventSummary[]>;
}

export interface WorkspaceApi {
  /** Open a native folder-picker dialog. Returns selected path or null. */
  openDialog(): Promise<string | null>;
  /** Read a directory's immediate children (1 level, lazy load). */
  readDir(dirPath: string): Promise<readonly DirEntry[]>;
  /** Create a new file with the given content. */
  createFile(filePath: string, content: string): Promise<void>;
  /** Get file/directory metadata. */
  stat(path: string): Promise<FileStat | null>;
  /** Read a file's content. Returns null if file cannot be read. */
  readFile(path: string): Promise<FileContent | null>;
  /** Get suggested workspace paths (home, Desktop, etc). Web mode only. */
  suggestPaths?: () => Promise<readonly SuggestedPath[]>;
}

export interface PlatformApi {
  readonly platform: "electron" | "web";
  readonly flow: FlowApi;
  readonly run: RunApi;
  readonly agent: AgentApi;
  readonly store: StoreApi;
  readonly workspace: WorkspaceApi;
  /** Subscribe to platform events. Returns an unsubscribe function. */
  on(channel: string, callback: (...args: any[]) => void): () => void;
  /**
   * Scan the .agents-flow/ directory and resolve the prompt asset manifest.
   *
   * In Electron mode, this uses Node.js fs to read the workspace's
   * .agents-flow/ directory directly. In Web mode, this uses the
   * WorkspaceApi to read files via the backend.
   *
   * @param workspaceDir - The root workspace directory path
   * @returns The resolved PromptAssetManifest (may contain errors)
   */
  scanPromptAssets(workspaceDir: string): Promise<PromptAssetManifest>;
}

// --- DTO types (mirrors shared-contracts IPC types) ---

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

/** A single entry in a directory listing (file or subdirectory). */
export interface DirEntry {
  readonly name: string;
  readonly path: string;
  readonly isDirectory: boolean;
  readonly isFlowFile: boolean;
  readonly isHidden?: boolean;
}

/** File/directory metadata from stat(). */
export interface FileStat {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly modifiedAt: number;
}

/** A suggested workspace path for web mode folder picker. */
export interface SuggestedPath {
  readonly name: string;
  readonly path: string;
}

/** Content of a file read from the filesystem. */
export interface FileContent {
  /** The file content as a UTF-8 string (empty if binary). */
  readonly content: string;
  /** Whether the file appears to be binary (contains null bytes). */
  readonly isBinary: boolean;
}