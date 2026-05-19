import type { FlowDefinition } from "@agentsflow/flow-schema";

/**
 * Plan-Execute-Evaluate Loop demo flow.
 *
 * This flow demonstrates the minimum closed-loop verification:
 *   Main Agent prompt → plan → subAgent execute → evaluate → loop decision → finish
 *
 * Topology:
 *   loader → agent.main(plan) → control.plan-loop → [plan output]
 *     → agent.main(plan) completes → loops back to plan-loop → [execute output]
 *     → agent.sub(normal) → agent.main(evaluate) → loops back to plan-loop → [execute or done]
 *     → [done output] → control.finish
 *
 * The plan-loop node has conditional outputs:
 *   - "plan" (first iteration): routes to main agent for planning
 *   - "execute" (subsequent iterations): routes to sub agent for execution
 *   - "done" (score >= threshold or max iterations): routes to finish
 */
export const planExecuteEvaluateFlow: FlowDefinition = {
  meta: {
    schemaVersion: "1.0",
    name: "Plan-Execute-Evaluate Loop",
    description: "Minimum closed-loop: plan → execute → evaluate → loop → finish",
    version: "0.1.0",
    tags: ["demo", "plan-loop", "evaluate"],
  },
  agents: {
    agentDefs: [
      {
        agentId: "main-agent",
        adapterKind: "fake",
        modelProfile: {
          systemPrompt: "You are a planning and evaluation agent.",
        },
        toolPolicy: {
          allowedCapabilities: [],
          blockedTools: [],
          approvalRequirement: "destructive_only",
        },
        memoryPolicy: {
          visibleScopes: ["run"],
          writableScopes: ["run"],
        },
        subagentPolicy: {
          allowedAgents: ["sub-agent"],
          switchModes: ["flow-forced"],
          returnStrategy: "summary-only",
        },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: { maxSteps: 10 },
      },
      {
        agentId: "sub-agent",
        adapterKind: "fake",
        modelProfile: {
          systemPrompt: "You are an execution agent. Carry out the plan.",
        },
        toolPolicy: {
          allowedCapabilities: [],
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
        nodeId: "input-loader",
        nodeKind: "loader.local-dir",
        label: "Input Loader",
        config: {},
        inputPorts: [{ portId: "in", dataType: "any", required: false }],
        outputPorts: [{ portId: "out", dataType: "any", required: true }],
        params: [],
      },
      {
        nodeId: "plan-loop",
        nodeKind: "control.plan-loop",
        label: "Plan-Execute Loop",
        config: {
          maxIterations: 5,
          completionThreshold: 0.8,
          evaluatePrompt: "Evaluate the execution result. Score from 0 to 1.",
        },
        inputPorts: [
          { portId: "in", dataType: "flow", required: true },
          { portId: "evaluate-result", dataType: "score", required: false },
        ],
        outputPorts: [
          { portId: "plan", dataType: "flow", required: true },
          { portId: "execute", dataType: "flow", required: true },
          { portId: "evaluate", dataType: "flow", required: true },
          { portId: "done", dataType: "flow", required: true },
          { portId: "score", dataType: "score", required: true },
        ],
        params: [
          { paramId: "maxIterations", paramType: "number", required: false, defaultValue: 5, description: "Maximum loop iterations" },
          { paramId: "completionThreshold", paramType: "number", required: false, defaultValue: 0.8, description: "Score threshold for completion" },
        ],
      },
      {
        nodeId: "main-plan",
        nodeKind: "agent.main",
        label: "Main Agent (Plan)",
        agentId: "main-agent",
        config: {
          turnMode: "plan",
          systemPrompt: "Create a plan for the given task.",
        },
        inputPorts: [{ portId: "in", dataType: "any", required: true }],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
          { portId: "plan", dataType: "plan", required: true },
        ],
        params: [],
      },
      {
        nodeId: "sub-execute",
        nodeKind: "agent.sub",
        label: "Sub Agent (Execute)",
        agentId: "sub-agent",
        config: {
          turnMode: "normal",
          systemPrompt: "Execute the plan steps.",
        },
        inputPorts: [{ portId: "in", dataType: "any", required: true }],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
          { portId: "result", dataType: "any", required: true },
        ],
        params: [],
      },
      {
        nodeId: "main-evaluate",
        nodeKind: "agent.main",
        label: "Main Agent (Evaluate)",
        agentId: "main-agent",
        config: {
          turnMode: "evaluate",
          evaluatePrompt: "Evaluate the execution result. Score from 0 to 1. Return JSON: {\"score\": <number>, \"canComplete\": <boolean>, \"reason\": \"<string>\"}",
        },
        inputPorts: [{ portId: "in", dataType: "any", required: true }],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
          { portId: "score", dataType: "score", required: true },
        ],
        params: [],
      },
      {
        nodeId: "finish",
        nodeKind: "control.finish",
        label: "Finish",
        config: {},
        inputPorts: [{ portId: "in", dataType: "flow", required: true }],
        outputPorts: [],
        params: [],
      },
    ],
    edges: [
      // Loader → Plan Loop
      { source: "input-loader", target: "plan-loop", targetHandle: "in", dataEdge: false },

      // Plan Loop → Main Plan (plan output)
      { source: "plan-loop", target: "main-plan", sourceHandle: "plan", targetHandle: "in", dataEdge: false },

      // Main Plan → Plan Loop (back for routing)
      { source: "main-plan", target: "plan-loop", targetHandle: "in", dataEdge: false },

      // Plan Loop → Sub Execute (execute output)
      { source: "plan-loop", target: "sub-execute", sourceHandle: "execute", targetHandle: "in", dataEdge: false },

      // Sub Execute → Main Evaluate (data flow)
      { source: "sub-execute", target: "main-evaluate", sourceHandle: "result", targetHandle: "in", dataEdge: true },

      // Main Evaluate → Plan Loop (back for loop decision)
      { source: "main-evaluate", target: "plan-loop", targetHandle: "evaluate-result", sourceHandle: "score", dataEdge: true },

      // Plan Loop → Finish (done output)
      { source: "plan-loop", target: "finish", sourceHandle: "done", dataEdge: false },
    ],
    startNodeId: "input-loader",
  },
  runtime: {
    maxConcurrency: 1,
    defaultTurnTimeoutMs: 60000,
    persistEvents: true,
    persistMemorySnapshots: false,
  },
  layout: {
    positions: [
      { nodeId: "input-loader", x: 50, y: 200 },
      { nodeId: "plan-loop", x: 250, y: 200 },
      { nodeId: "main-plan", x: 250, y: 50 },
      { nodeId: "sub-execute", x: 500, y: 350 },
      { nodeId: "main-evaluate", x: 500, y: 50 },
      { nodeId: "finish", x: 700, y: 200 },
    ],
    nodeBindings: [
      { nodeId: "main-plan", agentId: "main-agent" },
      { nodeId: "sub-execute", agentId: "sub-agent" },
      { nodeId: "main-evaluate", agentId: "main-agent" },
    ],
    viewport: { x: 0, y: 0, zoom: 0.8 },
  },
  extensions: {
    customNodeSpecs: [],
  },
};

/**
 * YAML string for the plan-execute-evaluate loop flow.
 * Used for IPC loading and round-trip serialization tests.
 */
export const planExecuteEvaluateFlowYaml = `meta:
  schemaVersion: '1.0'
  name: Plan-Execute-Evaluate Loop
  description: Minimum closed-loop - plan -> execute -> evaluate -> loop -> finish
  version: 0.1.0
  tags:
    - demo
    - plan-loop
    - evaluate
agents:
  agentDefs:
    - agentId: main-agent
      adapterKind: fake
      modelProfile:
        systemPrompt: You are a planning and evaluation agent.
      toolPolicy:
        allowedCapabilities: []
        blockedTools: []
        approvalRequirement: destructive_only
      memoryPolicy:
        visibleScopes:
          - run
        writableScopes:
          - run
      subagentPolicy:
        allowedAgents:
          - sub-agent
        switchModes:
          - flow-forced
        returnStrategy: summary-only
      timeouts:
        turnMs: 60000
        sessionMs: 300000
      budgets:
        maxSteps: 10
    - agentId: sub-agent
      adapterKind: fake
      modelProfile:
        systemPrompt: You are an execution agent. Carry out the plan.
      toolPolicy:
        allowedCapabilities: []
        blockedTools: []
        approvalRequirement: destructive_only
      memoryPolicy:
        visibleScopes:
          - run
        writableScopes:
          - run
          - node
      subagentPolicy:
        allowedAgents: []
        switchModes: []
        returnStrategy: summary-only
      timeouts:
        turnMs: 60000
        sessionMs: 300000
      budgets:
        maxSteps: 20
graph:
  nodes:
    - nodeId: input-loader
      nodeKind: loader.local-dir
      label: Input Loader
      config: {}
      inputPorts:
        - portId: in
          dataType: any
          required: false
      outputPorts:
        - portId: out
          dataType: any
      params: []
    - nodeId: plan-loop
      nodeKind: control.plan-loop
      label: Plan-Execute Loop
      config:
        maxIterations: 5
        completionThreshold: 0.8
        evaluatePrompt: Evaluate the execution result. Score from 0 to 1.
      inputPorts:
        - portId: in
          dataType: flow
        - portId: evaluate-result
          dataType: score
      outputPorts:
        - portId: plan
          dataType: flow
        - portId: execute
          dataType: flow
        - portId: evaluate
          dataType: flow
        - portId: done
          dataType: flow
        - portId: score
          dataType: score
      params:
        - paramId: maxIterations
          paramType: number
          defaultValue: 5
          description: Maximum loop iterations
        - paramId: completionThreshold
          paramType: number
          defaultValue: 0.8
          description: Score threshold for completion
    - nodeId: main-plan
      nodeKind: agent.main
      label: Main Agent (Plan)
      agentId: main-agent
      config:
        turnMode: plan
        systemPrompt: Create a plan for the given task.
      inputPorts:
        - portId: in
          dataType: any
      outputPorts:
        - portId: out
          dataType: any
        - portId: plan
          dataType: plan
      params: []
    - nodeId: sub-execute
      nodeKind: agent.sub
      label: Sub Agent (Execute)
      agentId: sub-agent
      config:
        turnMode: normal
        systemPrompt: Execute the plan steps.
      inputPorts:
        - portId: in
          dataType: any
      outputPorts:
        - portId: out
          dataType: any
        - portId: result
          dataType: any
      params: []
    - nodeId: main-evaluate
      nodeKind: agent.main
      label: Main Agent (Evaluate)
      agentId: main-agent
      config:
        turnMode: evaluate
        evaluatePrompt: 'Evaluate the execution result. Score from 0 to 1. Return JSON: {"score": <number>, "canComplete": <boolean>, "reason": "<string>"}'
      inputPorts:
        - portId: in
          dataType: any
      outputPorts:
        - portId: out
          dataType: any
        - portId: score
          dataType: score
      params: []
    - nodeId: finish
      nodeKind: control.finish
      label: Finish
      config: {}
      inputPorts:
        - portId: in
          dataType: flow
      outputPorts: []
      params: []
  edges:
    - source: input-loader
      target: plan-loop
      targetHandle: in
    - source: plan-loop
      target: main-plan
      sourceHandle: plan
      targetHandle: in
    - source: main-plan
      target: plan-loop
      targetHandle: in
    - source: plan-loop
      target: sub-execute
      sourceHandle: execute
      targetHandle: in
    - source: sub-execute
      target: main-evaluate
      sourceHandle: result
      targetHandle: in
      dataEdge: true
    - source: main-evaluate
      target: plan-loop
      targetHandle: evaluate-result
      sourceHandle: score
      dataEdge: true
    - source: plan-loop
      target: finish
      sourceHandle: done
  startNodeId: input-loader
runtime:
  maxConcurrency: 1
  defaultTurnTimeoutMs: 60000
  persistEvents: true
  persistMemorySnapshots: false
layout:
  positions:
    - nodeId: input-loader
      x: 50
      y: 200
    - nodeId: plan-loop
      x: 250
      y: 200
    - nodeId: main-plan
      x: 250
      y: 50
    - nodeId: sub-execute
      x: 500
      y: 350
    - nodeId: main-evaluate
      x: 500
      y: 50
    - nodeId: finish
      x: 700
      y: 200
  nodeBindings:
    - nodeId: main-plan
      agentId: main-agent
    - nodeId: sub-execute
      agentId: sub-agent
    - nodeId: main-evaluate
      agentId: main-agent
  viewport:
    x: 0
    y: 0
    zoom: 0.8
`;