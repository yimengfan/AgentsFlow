import type { ToolDefinition } from "./tool-definition.js";

/**
 * Whether a tool requires human approval before execution.
 */
export type ToolApprovalRequirement = "never" | "always" | "destructive_only";

/**
 * Policy governing how tools behave on this surface.
 */
export interface ToolSurfacePolicy {
  /** Whether this surface is read-only (no write/destructive tools) */
  readonly readOnly: boolean;
  /** Whether destructive operations are allowed */
  readonly allowDestructive: boolean;
  /** Approval requirement for tool execution */
  readonly approvalRequirement: ToolApprovalRequirement;
}

/**
 * ToolSurface — the set of tools available to an agent for a single turn.
 *
 * The platform constructs a ToolSurface per invocation based on:
 *   - The node's toolPolicy from the flow YAML
 *   - The agent's supported capabilities
 *   - The current runtime context
 *
 * The adapter receives this as part of AgentInvocation and uses
 * describeForModel() to present tools to the LLM.
 */
export interface ToolSurface {
  /** Unique surface identifier */
  readonly surfaceId: string;

  /** Capability domains allowed on this surface (e.g. "filesystem.read", "workspace.search") */
  readonly allowedCapabilities: readonly string[];

  /** Tool definitions visible for this turn */
  readonly tools: readonly ToolDefinition[];

  /** Policy governing tool behavior */
  readonly policy: ToolSurfacePolicy;

  /**
   * Execute a tool call through the platform.
   * The adapter calls this when the LLM requests a tool invocation.
   * Returns the tool result as a plain data structure.
   */
  invoke(toolCall: {
    readonly toolName: string;
    readonly arguments: Record<string, unknown>;
  }): Promise<unknown>;

  /**
   * Generate a simplified tool description suitable for LLM context.
   * Used by adapters to construct the tool list in the prompt.
   */
  describeForModel(): string;
}
