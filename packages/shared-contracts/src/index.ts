// @agentsflow/shared-contracts
// Shared types, IPC channel definitions, error codes, and common DTOs.
// Must not depend on Electron, React, or any specific agent SDK.

export type { IpcChannel, IpcChannelMap, DirEntry, FileStat, FileContent } from "./types/ipc-channels.js";
export type { ErrorCode, ErrorCategory, PlatformError } from "./types/errors.js";
export type { EventEnvelope } from "./types/event-envelope.js";
export type { RunId, NodeId, AgentId, InvocationId, TurnId, SessionId, AdapterKind } from "./types/identifiers.js";
