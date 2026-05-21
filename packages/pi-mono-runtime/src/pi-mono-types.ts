import type {
  AgentCapability,
  AgentInvocation,
  AgentTurnError,
  AgentTurnStatus,
  AgentTurnUsage,
  ToolCallSummary,
  TurnArtifact,
  TurnMode,
} from "@agentsflow/agent-contracts";

export interface PiMonoAdapterOptions {
  readonly flowName?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly adapterConfig?: unknown;
  readonly transport?: PiMonoTransport;
  readonly fetchImpl?: typeof fetch;
}

export interface PiMonoResolvedConfig {
  readonly flowName?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly adapterConfig?: Record<string, unknown>;
}

export interface PiMonoCreateSessionRequest {
  readonly runId: string;
  readonly flowName?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly adapterConfig?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface PiMonoCreateSessionResponse {
  readonly sessionId: string;
}

export interface PiMonoTurnRequest {
  readonly sessionId?: string;
  readonly invocationId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly agentId: string;
  readonly turnMode: TurnMode;
  readonly prompt: string;
  readonly input: Record<string, unknown>;
  readonly messages: AgentInvocation["messages"];
  readonly expectedOutput?: AgentInvocation["expectedOutput"];
  readonly flowName?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly adapterConfig?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface PiMonoTurnResponse {
  readonly status?: AgentTurnStatus;
  readonly finalText?: string;
  readonly structuredOutput?: Record<string, unknown>;
  readonly reasoningText?: string;
  readonly toolCalls?: readonly ToolCallSummary[];
  readonly artifacts?: readonly TurnArtifact[];
  readonly usage?: AgentTurnUsage;
  readonly warnings?: readonly string[];
  readonly error?: AgentTurnError;
  readonly rawPayloadRef?: string;
  readonly usedCapabilities?: readonly AgentCapability[];
}

export interface PiMonoTransport {
  createSession(request: PiMonoCreateSessionRequest): Promise<PiMonoCreateSessionResponse>;
  runTurn(request: PiMonoTurnRequest): Promise<PiMonoTurnResponse>;
  abort(turnId: string): Promise<void>;
  dispose(sessionId?: string): Promise<void>;
  validateConfig?(config: PiMonoResolvedConfig): string[];
  mapCapabilities?(requestedCapabilities: readonly AgentCapability[]): AgentCapability[];
}