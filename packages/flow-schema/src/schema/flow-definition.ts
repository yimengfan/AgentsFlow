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
});

export type AgentDef = z.infer<typeof AgentDefSchema>;

// ─── Graph ──────────────────────────────────────────────────

export const NodeDefSchema = z.object({
  /** Unique node ID within the flow */
  nodeId: z.string().min(1),
  /** Node type: agent, router, input, output, loop, parallel */
  nodeType: z.enum(["agent", "router", "input", "output", "loop", "parallel"]),
  /** Human-readable label */
  label: z.string().optional(),
  /** Node description */
  description: z.string().optional(),
  /** Default agent binding for this node */
  agentId: z.string().optional(),
  /** Node-specific config (varies by nodeType) */
  config: z.record(z.unknown()).optional().default({}),
});

export type NodeDef = z.infer<typeof NodeDefSchema>;

export const EdgeDefSchema = z.object({
  /** Source node ID */
  source: z.string().min(1),
  /** Target node ID */
  target: z.string().min(1),
  /** Source handle (for multi-output nodes) */
  sourceHandle: z.string().optional(),
  /** Edge label */
  label: z.string().optional(),
  /** Condition for conditional edges */
  condition: z.string().optional(),
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

export const NodeBindingSchema = z.object({
  /** The graph node this binding applies to */
  nodeId: z.string().min(1),
  /** The agent to use for this node */
  agentId: z.string().min(1),
  /** Per-node overrides of the agent definition */
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
  /** Node-agent bindings */
  nodeBindings: z.array(NodeBindingSchema).optional().default([]),
  /** Canvas viewport settings */
  viewport: z.object({
    x: z.number().optional().default(0),
    y: z.number().optional().default(0),
    zoom: z.number().positive().optional().default(1),
  }).optional().default({}),
});

export type Layout = z.infer<typeof LayoutSchema>;

// ─── Top-level Flow Definition ──────────────────────────────

export const FlowDefinitionSchema = z.object({
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
});

export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
