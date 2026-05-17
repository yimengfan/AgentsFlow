// @agentsflow/agent-contracts
// Agent-neutral abstract interfaces for the AgentsFlow platform.
// No concrete agent SDK names, no runtime, no Electron, no React.

export type { AgentAdapter, AgentSession, AgentSessionContext } from "./types/agent-adapter.js";
export type { AgentAdapterMetadata, AgentCapability } from "./types/agent-adapter-metadata.js";
export type { AgentInvocation, TurnMode } from "./types/agent-invocation.js";
export type {
  AgentTurnResult,
  AgentTurnStatus,
  AgentTurnUsage,
  AgentTurnError,
} from "./types/agent-turn-result.js";
export type {
  ToolSurface,
  ToolSurfacePolicy,
  ToolApprovalRequirement,
} from "./types/tool-surface.js";
export type {
  ToolDefinition,
  ToolSideEffectLevel,
} from "./types/tool-definition.js";
export type {
  MemoryFacade,
  MemoryReadQuery,
  MemorySearchQuery,
  MemoryWriteDecision,
} from "./types/memory-facade.js";
export type {
  MemoryScopePolicy,
  MemoryScope,
  RetentionPolicy,
  RedactRule,
} from "./types/memory-scope-policy.js";
export type {
  MemoryWrite,
  MemoryWriteOperation,
  MemoryWriteVisibility,
} from "./types/memory-write.js";
export type {
  SubagentSwitchRequest,
  SubagentSwitchMode,
  SubagentReturnStrategy,
} from "./types/subagent-switch-request.js";
export type {
  SubagentSwitchDecision,
  SubagentSwitchDecisionType,
  PolicyTraceEntry,
} from "./types/subagent-switch-decision.js";
export type {
  AgentEvent,
  AgentEventType,
  EventSchemaVersion,
} from "./types/agent-event.js";
export type {
  InterruptHandle,
  InterruptType,
} from "./types/interrupt-handle.js";
export type {
  AgentRegistry,
  AgentAdapterFactory,
  CompatibilityResult,
  CompatibilityLevel,
} from "./types/agent-registry.js";
