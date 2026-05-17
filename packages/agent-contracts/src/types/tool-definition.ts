/**
 * Side-effect level of a tool, used for policy enforcement.
 */
export type ToolSideEffectLevel = "none" | "read" | "write" | "destructive";

/**
 * ToolDefinition — describes a single tool available to an agent.
 *
 * The platform creates ToolDefinitions based on the flow's tool policy.
 * Adapters use these to construct the tool list presented to the LLM.
 */
export interface ToolDefinition {
  /** Unique tool name (must be stable across runs) */
  readonly toolName: string;

  /** Capability domain this tool belongs to (e.g. "filesystem", "workspace") */
  readonly capability: string;

  /** Human and model-readable description of what this tool does */
  readonly description: string;

  /** JSON Schema for tool input */
  readonly inputSchema: Record<string, unknown>;

  /** JSON Schema for tool output (optional) */
  readonly outputSchema?: Record<string, unknown>;

  /** Whether this tool requires human approval before execution */
  readonly requiresApproval: boolean;

  /** Side-effect level for policy enforcement */
  readonly sideEffectLevel: ToolSideEffectLevel;
}
