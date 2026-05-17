/**
 * Branded identifier types for the AgentsFlow platform.
 *
 * These are nominal types (not just string aliases) to prevent
 * accidental misuse of IDs across different domains.
 */

/** Unique identifier for a flow run */
export type RunId = string & { readonly __brand: "RunId" };

/** Unique identifier for a graph node within a flow */
export type NodeId = string & { readonly __brand: "NodeId" };

/** Unique identifier for an agent definition within a flow */
export type AgentId = string & { readonly __brand: "AgentId" };

/** Unique identifier for a single agent invocation */
export type InvocationId = string & { readonly __brand: "InvocationId" };

/** Unique identifier for a single turn within an invocation */
export type TurnId = string & { readonly __brand: "TurnId" };

/** Unique identifier for an agent session */
export type SessionId = string & { readonly __brand: "SessionId" };

/** Adapter kind discriminator (e.g. "fake", "rpc", "ai-sdk") */
export type AdapterKind = string & { readonly __brand: "AdapterKind" };

// Brand constructors — runtime no-ops, compile-time branding

export const asRunId = (id: string): RunId => id as RunId;
export const asNodeId = (id: string): NodeId => id as NodeId;
export const asAgentId = (id: string): AgentId => id as AgentId;
export const asInvocationId = (id: string): InvocationId => id as InvocationId;
export const asTurnId = (id: string): TurnId => id as TurnId;
export const asSessionId = (id: string): SessionId => id as SessionId;
export const asAdapterKind = (kind: string): AdapterKind => kind as AdapterKind;
