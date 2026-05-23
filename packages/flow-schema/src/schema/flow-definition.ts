import { z } from "zod";

// ─── Meta ───────────────────────────────────────────────────

export const FlowMetaSchema = z.object({
  /** Flow schema version for migration */
  schemaVersion: z.string().min(1),
  /** Human-readable flow name */
  name: z.string().min(1),
  /** Flow description */
  description: z.string().optional(),
  /** Flow version */
  version: z.string().optional().default("0.1.0"),
  /** Tags for categorization */
  tags: z.array(z.string()).optional().default([]),
  /** Author information */
  author: z.string().optional(),
});

export type FlowMeta = z.infer<typeof FlowMetaSchema>;

// ─── Agent Definitions ──────────────────────────────────────

export const AgentDefSchema = z.object({
  /** Flow-unique agent identifier */
  agentId: z.string().min(1),
  /** Which adapter to use (e.g. "fake", "rpc", "ai-sdk") */
  adapterKind: z.string().min(1),
  /** Model and role configuration */
  modelProfile: z.object({
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional().default({}),
  /** Tool exposure policy */
  toolPolicy: z.object({
    allowedCapabilities: z.array(z.string()).optional().default([]),
    blockedTools: z.array(z.string()).optional().default([]),
    approvalRequirement: z.enum(["never", "always", "destructive_only"]).optional().default("destructive_only"),
  }).optional().default({}),
  /** Memory scope policy */
  memoryPolicy: z.object({
    visibleScopes: z.array(z.enum(["session", "run", "node", "agent-local", "artifacts"])).optional().default(["run"]),
    writableScopes: z.array(z.enum(["session", "run", "node", "agent-local", "artifacts"])).optional().default([]),
    maxItems: z.number().int().positive().optional(),
    maxBytes: z.number().int().positive().optional(),
  }).optional().default({}),
  /** Subagent switching policy */
  subagentPolicy: z.object({
    allowedAgents: z.array(z.string()).optional().default([]),
    switchModes: z.array(z.enum(["flow-forced", "policy-resolved", "agent-suggested"])).optional().default([]),
    returnStrategy: z.enum(["summary-only", "full-trace", "structured-output"]).optional().default("summary-only"),
    maxDelegations: z.number().int().nonnegative().optional(),
  }).optional().default({}),
  /** Timeout configuration */
  timeouts: z.object({
    turnMs: z.number().int().positive().optional().default(60000),
    sessionMs: z.number().int().positive().optional().default(300000),
  }).optional().default({}),
  /** Budget constraints */
  budgets: z.object({
    maxTokens: z.number().int().positive().optional(),
    maxCostUsd: z.number().positive().optional(),
    maxSteps: z.number().int().positive().optional(),
    maxWallClockMs: z.number().int().positive().optional(),
  }).optional().default({}),
  /** Adapter-specific configuration */
  adapterConfig: z.record(z.unknown()).optional(),
  /** Built-in output kind — determines which output port the runtime publishes to */
  outputKind: z.enum(["text", "plan", "score"]).optional(),
});

export type AgentDef = z.infer<typeof AgentDefSchema>;

// ─── Port & Parameter Definitions ───────────────────────────

/**
 * Data type identifiers for port values.
 * Used to validate that connected ports have compatible types.
 */
export const PortDataTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "any",
  "flow",        // Control flow signal (no data, just execution order)
  "prompt",      // Prompt/template string
  "documents",   // Loaded document array
  "plan",        // Structured plan output
  "score",       // Evaluation score result
  "artifact",    // Generic artifact reference
]);

export type PortDataType = z.infer<typeof PortDataTypeSchema>;

/**
 * A single input or output port on a node.
 */
export const PortDefSchema = z.object({
  /** Unique port ID within this node (e.g. "in", "out", "prompt", "data") */
  portId: z.string().min(1),
  /** Human-readable label */
  label: z.string().optional(),
  /** Data type carried by this port */
  dataType: PortDataTypeSchema,
  /** Whether this port must be connected for the node to execute */
  required: z.boolean().optional().default(true),
  /** Description / tooltip */
  description: z.string().optional(),
  /** Default value when no connection is made (only for optional input ports) */
  defaultValue: z.unknown().optional(),
});

export type PortDef = z.infer<typeof PortDefSchema>;

/**
 * Parameter definition for a node's configuration form.
 */
export const ParamDefSchema = z.object({
  /** Unique parameter key within this node */
  paramId: z.string().min(1),
  /** Human-readable label */
  label: z.string().optional(),
  /** Parameter type — determines the UI control and validation */
  paramType: z.enum([
    "string",
    "number",
    "boolean",
    "select",
    "multiselect",
    "path",
    "url",
    "secret",
    "json",
    "code",
  ]),
  /** Whether this parameter is required */
  required: z.boolean().optional().default(true),
  /** Default value */
  defaultValue: z.unknown().optional(),
  /** For select/multiselect: available options */
  options: z.array(z.object({
    value: z.string(),
    label: z.string().optional(),
  })).optional(),
  /** Description / tooltip */
  description: z.string().optional(),
  /** Zod-like validation hints (min, max, pattern, etc.) */
  validation: z.record(z.unknown()).optional(),
  /** Group name for organizing parameters in the UI */
  group: z.string().optional(),
});

export type ParamDef = z.infer<typeof ParamDefSchema>;

/**
 * Custom node spec embedded in a flow definition.
 * This lets flows extend the palette/runtime without patching built-in registries.
 */
export const CustomNodeSpecSchema = z.object({
  /** Machine-readable kind identifier (e.g. "loader.http-auth", "agent.main") */
  kind: z.string().min(1),
  /** Human-readable display label */
  label: z.string().min(1),
  /** Category path for palette grouping, using "/" as separator (e.g. "Loader/HTTP", "Agent/Main") */
  category: z.string().min(1),
  /** Detailed description / tooltip */
  description: z.string().min(1),
  /** Icon identifier for the palette */
  icon: z.string().min(1),
  /** Input port definitions */
  inputPorts: z.array(PortDefSchema).optional().default([]),
  /** Output port definitions */
  outputPorts: z.array(PortDefSchema).optional().default([]),
  /** Parameter definitions for this node's config form */
  params: z.array(ParamDefSchema).optional().default([]),
  /** Compatible node kind for legacy nodeType mapping */
  legacyNodeType: z.string().optional(),
  /** Tags for filtering in the palette */
  tags: z.array(z.string()).optional().default([]),
  /** Whether this kind appears in the palette (false = internal-only) */
  visible: z.boolean().optional().default(true),
  /** Maximum instances allowed per flow (0 = unlimited) */
  maxInstances: z.number().int().nonnegative().optional().default(0),
  /** Flow direction hint: "horizontal" = left→right (default), "vertical" = top→bottom */
  flowDirection: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
});

export type CustomNodeSpec = z.infer<typeof CustomNodeSpecSchema>;

// ─── Graph ──────────────────────────────────────────────────

export const NodeDefSchema = z.object({
  /** Unique node ID within the flow */
  nodeId: z.string().min(1),
  /**
   * Node type (legacy enum for backward compat).
   * New flows should use nodeKind instead.
   */
  nodeType: z.enum(["agent", "router", "input", "output", "loop", "parallel"]).optional(),
  /**
   * Machine-readable node kind (e.g. "loader.http-auth", "agent.main", "control.plan-loop").
   * Takes precedence over nodeType when present.
   */
  nodeKind: z.string().min(1).optional(),
  /** Human-readable label */
  label: z.string().optional(),
  /** Node description */
  description: z.string().optional(),
  /** Default agent binding for this node */
  agentId: z.string().optional(),
  /** Reference to an external .agent.md agentId; takes precedence over agentId when present */
  agentRef: z.string().optional(),
  /** Node-specific config (varies by nodeType) */
  config: z.record(z.unknown()).optional().default({}),
  /** Input port definitions */
  inputPorts: z.array(PortDefSchema).optional().default([]),
  /** Output port definitions */
  outputPorts: z.array(PortDefSchema).optional().default([]),
  /** Parameter definitions for this node's config form */
  params: z.array(ParamDefSchema).optional().default([]),
  /** Category path for grouping in the node palette (e.g. "Loader/HTTP", "Agent/Main") */
  category: z.string().optional(),
});

export type NodeDef = z.infer<typeof NodeDefSchema>;

export const EdgeDefSchema = z.object({
  /** Source node ID */
  source: z.string().min(1),
  /** Target node ID */
  target: z.string().min(1),
  /** Source handle / port ID (for multi-output nodes) */
  sourceHandle: z.string().optional(),
  /** Target handle / port ID (for multi-input nodes) */
  targetHandle: z.string().optional(),
  /** Edge label */
  label: z.string().optional(),
  /** Condition for conditional edges */
  condition: z.string().optional(),
  /** Whether this edge carries data (vs. just control flow) */
  dataEdge: z.boolean().optional().default(false),
});

export type EdgeDef = z.infer<typeof EdgeDefSchema>;

export const GraphSchema = z.object({
  /** All nodes in the flow */
  nodes: z.array(NodeDefSchema).min(1),
  /** All edges connecting nodes */
  edges: z.array(EdgeDefSchema),
  /** Starting node ID */
  startNodeId: z.string().min(1),
});

export type Graph = z.infer<typeof GraphSchema>;

// ─── Runtime ────────────────────────────────────────────────

export const RuntimeSchema = z.object({
  /** Maximum concurrent node executions */
  maxConcurrency: z.number().int().positive().optional().default(1),
  /** Default turn timeout in ms */
  defaultTurnTimeoutMs: z.number().int().positive().optional().default(60000),
  /** Whether to persist run events */
  persistEvents: z.boolean().optional().default(true),
  /** Whether to persist memory snapshots */
  persistMemorySnapshots: z.boolean().optional().default(false),
  /** Global execution budget */
  globalBudget: z.object({
    maxTokens: z.number().int().positive().optional(),
    maxCostUsd: z.number().positive().optional(),
    maxSteps: z.number().int().positive().optional(),
    maxWallClockMs: z.number().int().positive().optional(),
  }).optional(),
});

export type Runtime = z.infer<typeof RuntimeSchema>;

// ─── Layout ─────────────────────────────────────────────────

export const NodePositionSchema = z.object({
  /** Node ID */
  nodeId: z.string().min(1),
  /** X position on canvas */
  x: z.number(),
  /** Y position on canvas */
  y: z.number(),
  /** Visual width (optional) */
  width: z.number().positive().optional(),
  /** Visual height (optional) */
  height: z.number().positive().optional(),
});

export type NodePosition = z.infer<typeof NodePositionSchema>;

/**
 * Descriptive node-agent binding metadata used by layout-aware tooling.
 *
 * Current runtime execution still resolves agents from `graph.nodes[*].agentId`.
 * These bindings and overrides are not merged automatically by the engine.
 */
export const NodeBindingSchema = z.object({
  /** The graph node this descriptive binding refers to */
  nodeId: z.string().min(1),
  /** The agent associated with this node for layout and tooling metadata */
  agentId: z.string().min(1),
  /** Optional metadata reserved for future per-node tooling or runtime override support */
  overrides: z.object({
    modelProfile: AgentDefSchema.shape.modelProfile.optional(),
    toolPolicy: AgentDefSchema.shape.toolPolicy.optional(),
    memoryPolicy: AgentDefSchema.shape.memoryPolicy.optional(),
    subagentPolicy: AgentDefSchema.shape.subagentPolicy.optional(),
    timeouts: AgentDefSchema.shape.timeouts.optional(),
    budgets: AgentDefSchema.shape.budgets.optional(),
  }).optional(),
});

export type NodeBinding = z.infer<typeof NodeBindingSchema>;

export const LayoutSchema = z.object({
  /** Node positions for the canvas */
  positions: z.array(NodePositionSchema).optional().default([]),
  /** Optional descriptive node-agent bindings for layout-aware tooling */
  nodeBindings: z.array(NodeBindingSchema).optional().default([]),
  /** Canvas viewport settings */
  viewport: z.object({
    x: z.number().optional().default(0),
    y: z.number().optional().default(0),
    zoom: z.number().positive().optional().default(1),
  }).optional().default({}),
});

export type Layout = z.infer<typeof LayoutSchema>;

// ─── Extensions ─────────────────────────────────────────────

export const ExtensionsSchema = z.object({
  /** Additional node specifications loaded by this flow at runtime. */
  customNodeSpecs: z.array(CustomNodeSpecSchema).optional().default([]),
});

export type Extensions = z.infer<typeof ExtensionsSchema>;

// ─── Top-level Flow Definition ──────────────────────────────

export const FlowDefinitionSchema = z.object({
  /** Explicit AgentsFlow marker — optional, used for quick identification */
  agentsflow: z.boolean().optional(),
  /** Flow metadata */
  meta: FlowMetaSchema,
  /** Agent definitions */
  agents: z.object({
    agentDefs: z.array(AgentDefSchema),
  }),
  /** Graph definition */
  graph: GraphSchema,
  /** Runtime configuration */
  runtime: RuntimeSchema.optional().default({}),
  /** Layout and binding information */
  layout: LayoutSchema.optional().default({}),
  /** Flow-local extensions such as custom node specifications */
  extensions: ExtensionsSchema.optional().default({}),
}).passthrough();

export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
