/**
 * PlatformApi — the unified interface for platform operations.
 *
 * Both Electron IPC and HTTP REST backends implement this same interface.
 * UI components call these methods without knowing the underlying transport.
 */

export interface FlowApi {
  list(): Promise<readonly FlowSummary[]>;
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

export interface PlatformApi {
  readonly platform: "electron" | "web";
  readonly flow: FlowApi;
  readonly run: RunApi;
  readonly agent: AgentApi;
  readonly store: StoreApi;
  /** Subscribe to platform events. Returns an unsubscribe function. */
  on(channel: string, callback: (...args: any[]) => void): () => void;
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