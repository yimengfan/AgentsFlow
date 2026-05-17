import type { FlowDefinition } from "@agentsflow/flow-schema";

/**
 * Golden flow fixtures for testing.
 * These are minimal but valid flow definitions used across tests.
 */

/** Minimal single-agent single-node flow */
export const minimalFlow: FlowDefinition = {
  meta: {
    schemaVersion: "1.0",
    name: "Minimal Test Flow",
    version: "0.1.0",
    tags: [],
  },
  agents: {
    agentDefs: [
      {
        agentId: "test-agent",
        adapterKind: "fake",
        modelProfile: {},
        toolPolicy: {
          allowedCapabilities: [],
          blockedTools: [],
          approvalRequirement: "destructive_only",
        },
        memoryPolicy: {
          visibleScopes: ["run"],
          writableScopes: [],
        },
        subagentPolicy: {
          allowedAgents: [],
          switchModes: [],
          returnStrategy: "summary-only",
        },
        timeouts: {
          turnMs: 60000,
          sessionMs: 300000,
        },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "start",
        nodeType: "agent",
        label: "Start Node",
        agentId: "test-agent",
        config: {},
      },
      {
        nodeId: "end",
        nodeType: "output",
        label: "End Node",
        config: {},
      },
    ],
    edges: [
      {
        source: "start",
        target: "end",
      },
    ],
    startNodeId: "start",
  },
  runtime: {
    maxConcurrency: 1,
    defaultTurnTimeoutMs: 60000,
    persistEvents: true,
    persistMemorySnapshots: false,
  },
  layout: {
    positions: [
      { nodeId: "start", x: 100, y: 200 },
      { nodeId: "end", x: 400, y: 200 },
    ],
    nodeBindings: [
      {
        nodeId: "start",
        agentId: "test-agent",
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
};

/** Multi-agent flow with subagent switching */
export const multiAgentFlow: FlowDefinition = {
  meta: {
    schemaVersion: "1.0",
    name: "Multi-Agent Test Flow",
    description: "A flow with two agents and a router",
    version: "0.1.0",
    tags: ["test", "multi-agent"],
  },
  agents: {
    agentDefs: [
      {
        agentId: "planner",
        adapterKind: "fake",
        modelProfile: {
          systemPrompt: "You are a planning agent.",
        },
        toolPolicy: {
          allowedCapabilities: [],
          blockedTools: [],
          approvalRequirement: "destructive_only",
        },
        memoryPolicy: {
          visibleScopes: ["run", "session"],
          writableScopes: ["run"],
        },
        subagentPolicy: {
          allowedAgents: ["executor"],
          switchModes: ["agent-suggested", "policy-resolved"],
          returnStrategy: "summary-only",
          maxDelegations: 3,
        },
        timeouts: { turnMs: 30000, sessionMs: 300000 },
        budgets: { maxSteps: 10 },
      },
      {
        agentId: "executor",
        adapterKind: "fake",
        modelProfile: {
          systemPrompt: "You are an execution agent.",
        },
        toolPolicy: {
          allowedCapabilities: ["filesystem.read", "workspace.search"],
          blockedTools: [],
          approvalRequirement: "destructive_only",
        },
        memoryPolicy: {
          visibleScopes: ["run"],
          writableScopes: ["run", "node"],
        },
        subagentPolicy: {
          allowedAgents: [],
          switchModes: [],
          returnStrategy: "summary-only",
        },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: { maxSteps: 20 },
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "input",
        nodeType: "input",
        label: "User Input",
        config: {},
      },
      {
        nodeId: "plan",
        nodeType: "agent",
        label: "Plan",
        agentId: "planner",
        config: {},
      },
      {
        nodeId: "execute",
        nodeType: "agent",
        label: "Execute",
        agentId: "executor",
        config: {},
      },
      {
        nodeId: "output",
        nodeType: "output",
        label: "Result",
        config: {},
      },
    ],
    edges: [
      { source: "input", target: "plan" },
      { source: "plan", target: "execute" },
      { source: "execute", target: "output" },
    ],
    startNodeId: "input",
  },
  runtime: {
    maxConcurrency: 1,
    defaultTurnTimeoutMs: 60000,
    persistEvents: true,
    persistMemorySnapshots: false,
  },
  layout: {
    positions: [
      { nodeId: "input", x: 100, y: 200 },
      { nodeId: "plan", x: 300, y: 200 },
      { nodeId: "execute", x: 500, y: 200 },
      { nodeId: "output", x: 700, y: 200 },
    ],
    nodeBindings: [
      { nodeId: "plan", agentId: "planner" },
      { nodeId: "execute", agentId: "executor" },
    ],
    viewport: { x: 0, y: 0, zoom: 0.8 },
  },
};

/** YAML string for the minimal flow, used in round-trip tests */
export const minimalFlowYaml = `meta:
  schemaVersion: '1.0'
  name: Minimal Test Flow
  version: 0.1.0
agents:
  agentDefs:
    - agentId: test-agent
      adapterKind: fake
graph:
  nodes:
    - nodeId: start
      nodeType: agent
      label: Start Node
      agentId: test-agent
    - nodeId: end
      nodeType: output
      label: End Node
  edges:
    - source: start
      target: end
  startNodeId: start
`;
