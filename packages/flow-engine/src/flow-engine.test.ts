import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter, AgentInvocation, AgentSession, AgentSessionContext, AgentTurnResult } from "@agentsflow/agent-contracts";
import type { FlowDefinition } from "@agentsflow/flow-schema";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";
import { minimalFlow, multiAgentFlow } from "@agentsflow/testing-kit";
import { FlowScheduler } from "./scheduler/flow-scheduler.js";
import { NodeExecutor } from "./executor/node-executor.js";
import { RunContext } from "./context/run-context.js";
import { EventBus } from "./events/event-bus.js";
import { SubagentArbiter } from "./arbiter/subagent-arbiter.js";

// ─── Test Helpers ────────────────────────────────────────────

const FAKE_ADAPTER_KIND = "fake";

function createFakeAdapterResolver(adapter: AgentAdapter = new FakeAgentAdapter()) {
  return (adapterKind: string): AgentAdapter | undefined => {
    if (adapterKind === FAKE_ADAPTER_KIND) return adapter;
    return undefined;
  };
}

/** Wait for a run to reach a terminal state */
async function waitForRun(
  scheduler: FlowScheduler,
  runId: string,
  timeoutMs = 5000,
): Promise<"completed" | "failed"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ctx = scheduler.getRunState(runId);
    if (ctx?.state === "completed") return "completed";
    if (ctx?.state === "failed") return "failed";
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Run ${runId} did not complete within ${timeoutMs}ms`);
}

/** Collect all events of a given type during a run */
function collectEvents(scheduler: FlowScheduler, eventType: string) {
  const events: Array<Record<string, unknown>> = [];
  scheduler.events.on(eventType as any, (e: any) => { events.push(e); });
  return events;
}

// ─── Minimal flow with agentId set ──────────────────────────

const singleAgentFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "Single Agent Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [
      {
        agentId: "test-agent",
        adapterKind: FAKE_ADAPTER_KIND,
        modelProfile: {},
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "Main Agent",
        agentId: "test-agent",
        config: { turnMode: "normal" },
        inputPorts: [],
        outputPorts: [{ portId: "out", dataType: "any", required: true }],
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
      { source: "main-agent", target: "finish", dataEdge: false },
    ],
    startNodeId: "main-agent",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: {
    positions: [{ nodeId: "main-agent", x: 100, y: 100 }, { nodeId: "finish", x: 300, y: 100 }],
    nodeBindings: [{ nodeId: "main-agent", agentId: "test-agent" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: { customNodeSpecs: [] },
};

// ─── Flow with agentRef but NO agentId (the bug scenario) ───

const agentRefOnlyFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "AgentRef Only Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [
      {
        agentId: "main-agent",
        adapterKind: FAKE_ADAPTER_KIND,
        modelProfile: { systemPrompt: "You are a planning agent." },
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "main-prompt",
        nodeKind: "agent.main",
        label: "主 Agent",
        agentRef: "main-agent",
        // NOTE: no agentId — this is the bug scenario
        config: { turnMode: "plan", userPrompt: "请设计一个贪吃蛇" },
        inputPorts: [{ portId: "in", dataType: "flow", required: true }],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
          { portId: "result", dataType: "string", required: true },
          { portId: "plan", dataType: "plan", required: true },
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
      { source: "main-prompt", target: "finish", dataEdge: false },
    ],
    startNodeId: "main-prompt",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: {
    positions: [{ nodeId: "main-prompt", x: 100, y: 100 }, { nodeId: "finish", x: 300, y: 100 }],
    nodeBindings: [{ nodeId: "main-prompt", agentId: "main-agent" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: { customNodeSpecs: [] },
};

// ─── Flow with loader → agent → finish ─────────────────────

const loaderAgentFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "Loader Agent Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [
      {
        agentId: "test-agent",
        adapterKind: FAKE_ADAPTER_KIND,
        modelProfile: {},
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "loader",
        nodeKind: "loader.work-dir",
        label: "Loader",
        config: {},
        inputPorts: [{ portId: "in", dataType: "flow", required: true }],
        outputPorts: [{ portId: "out", dataType: "any", required: true }, { portId: "data", dataType: "any", required: true }],
        params: [],
      },
      {
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "Main Agent",
        agentId: "test-agent",
        config: { turnMode: "normal" },
        inputPorts: [{ portId: "in", dataType: "flow", required: true }],
        outputPorts: [{ portId: "out", dataType: "any", required: true }],
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
      { source: "loader", target: "main-agent", dataEdge: false },
      { source: "main-agent", target: "finish", dataEdge: false },
    ],
    startNodeId: "loader",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: {
    positions: [
      { nodeId: "loader", x: 50, y: 200 },
      { nodeId: "main-agent", x: 300, y: 200 },
      { nodeId: "finish", x: 500, y: 200 },
    ],
    nodeBindings: [{ nodeId: "main-agent", agentId: "test-agent" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: { customNodeSpecs: [] },
};

// ─── Flow with missing agentDef ─────────────────────────────

const missingAgentDefFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "Missing AgentDef Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [], // No agentDefs!
  },
  graph: {
    nodes: [
      {
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "Main Agent",
        agentId: "nonexistent-agent",
        config: { turnMode: "normal" },
        inputPorts: [],
        outputPorts: [],
        params: [],
      },
    ],
    edges: [],
    startNodeId: "main-agent",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: { positions: [], nodeBindings: [], viewport: { x: 0, y: 0, zoom: 1 } },
  extensions: { customNodeSpecs: [] },
};

// ─── Flow with unknown adapterKind ──────────────────────────

const unknownAdapterFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "Unknown Adapter Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [
      {
        agentId: "test-agent",
        adapterKind: "nonexistent-adapter",
        modelProfile: {},
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "Main Agent",
        agentId: "test-agent",
        config: { turnMode: "normal" },
        inputPorts: [],
        outputPorts: [],
        params: [],
      },
    ],
    edges: [],
    startNodeId: "main-agent",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: { positions: [], nodeBindings: [], viewport: { x: 0, y: 0, zoom: 1 } },
  extensions: { customNodeSpecs: [] },
};

// ─── Flow with data edges between agent nodes ───────────────

const dataEdgeFlow: FlowDefinition = {
  meta: { schemaVersion: "1.0", name: "Data Edge Flow", version: "0.1.0", tags: [] },
  agents: {
    agentDefs: [
      {
        agentId: "agent-a",
        adapterKind: FAKE_ADAPTER_KIND,
        modelProfile: { systemPrompt: "Agent A" },
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
      {
        agentId: "agent-b",
        adapterKind: FAKE_ADAPTER_KIND,
        modelProfile: { systemPrompt: "Agent B" },
        toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
        memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
        subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
        timeouts: { turnMs: 60000, sessionMs: 300000 },
        budgets: {},
      },
    ],
  },
  graph: {
    nodes: [
      {
        nodeId: "agent-a",
        nodeKind: "agent.main",
        label: "Agent A",
        agentId: "agent-a",
        config: { turnMode: "normal" },
        inputPorts: [{ portId: "in", dataType: "flow", required: true }],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
          { portId: "result", dataType: "string", required: true },
        ],
        params: [],
      },
      {
        nodeId: "agent-b",
        nodeKind: "agent.sub",
        label: "Agent B",
        agentId: "agent-b",
        config: { turnMode: "normal" },
        inputPorts: [{ portId: "in", dataType: "flow", required: true }, { portId: "data", dataType: "any", required: false }],
        outputPorts: [{ portId: "out", dataType: "any", required: true }, { portId: "result", dataType: "string", required: true }],
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
      { source: "agent-a", target: "agent-b", dataEdge: false },
      { source: "agent-a", target: "agent-b", sourceHandle: "result", targetHandle: "data", dataEdge: true },
      { source: "agent-b", target: "finish", dataEdge: false },
    ],
    startNodeId: "agent-a",
  },
  runtime: { maxConcurrency: 1, defaultTurnTimeoutMs: 60000, persistEvents: true, persistMemorySnapshots: false },
  layout: {
    positions: [
      { nodeId: "agent-a", x: 100, y: 200 },
      { nodeId: "agent-b", x: 400, y: 200 },
      { nodeId: "finish", x: 700, y: 200 },
    ],
    nodeBindings: [{ nodeId: "agent-a", agentId: "agent-a" }, { nodeId: "agent-b", agentId: "agent-b" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: { customNodeSpecs: [] },
};

// ═══════════════════════════════════════════════════════════
// FlowScheduler Tests
// ═══════════════════════════════════════════════════════════

describe("FlowScheduler", () => {
  afterEach(() => {
    // Clean up any active runs
  });

  // ─── Basic Execution ────────────────────────────────────────

  describe("startRun", () => {
    it("should execute a minimal single-agent flow to completion", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const events = collectEvents(scheduler, "run_completed");

      const runId = await scheduler.startRun(singleAgentFlow, { userPrompt: "Hello" });
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("completed");
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("should emit run_started and run_completed events", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const startedEvents = collectEvents(scheduler, "run_started");
      const completedEvents = collectEvents(scheduler, "run_completed");

      const runId = await scheduler.startRun(singleAgentFlow);
      await waitForRun(scheduler, runId);

      expect(startedEvents.length).toBe(1);
      expect(completedEvents.length).toBe(1);
      expect(startedEvents[0]!.runId).toBe(runId);
      expect(completedEvents[0]!.runId).toBe(runId);
    });

    it("should execute a flow with a loader node before agent node", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(loaderAgentFlow, { userPrompt: "Test" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });

    it("should execute a multi-agent flow with data edges", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(dataEdgeFlow, { userPrompt: "Test data flow" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });
  });

  // ─── Agent Node Driver — agentId Resolution ─────────────────

  describe("executeAgentNode — agentId resolution", () => {
    it("should resolve agentRef to agentId when agentId is missing but agentRef matches an agentDef", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const completedEvents = collectEvents(scheduler, "run_completed");

      // agentRefOnlyFlow has agentRef="main-agent" but no agentId.
      // The agentDef with agentId="main-agent" exists, so agentRef should resolve.
      const runId = await scheduler.startRun(agentRefOnlyFlow, { userPrompt: "请设计一个贪吃蛇" });
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("completed");
      expect(completedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw when agent node has no agentId, no config.agentId, and no agentRef", async () => {
      // Create a flow with an agent node that has neither agentId nor agentRef
      const noIdNoRefFlow: FlowDefinition = {
        ...singleAgentFlow,
        graph: {
          ...singleAgentFlow.graph,
          nodes: singleAgentFlow.graph.nodes.map((n) =>
            n.nodeId === "main-agent"
              ? { ...n, agentId: undefined, agentRef: undefined }
              : n,
          ),
        },
      };

      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const failedEvents = collectEvents(scheduler, "run_failed");

      const runId = await scheduler.startRun(noIdNoRefFlow);
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("failed");
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      const errorPayload = failedEvents[0]!.payload as { error: string };
      expect(errorPayload.error).toContain("has no agentId");
    });

    it("should throw when agentId references a nonexistent agentDef", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const failedEvents = collectEvents(scheduler, "run_failed");

      const runId = await scheduler.startRun(missingAgentDefFlow);
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("failed");
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      const errorPayload = failedEvents[0]!.payload as { error: string };
      expect(errorPayload.error).toContain("not found");
    });

    it("should throw when adapterKind is not registered", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const failedEvents = collectEvents(scheduler, "run_failed");

      const runId = await scheduler.startRun(unknownAdapterFlow);
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("failed");
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      const errorPayload = failedEvents[0]!.payload as { error: string };
      expect(errorPayload.error).toContain("Adapter");
      expect(errorPayload.error).toContain("not found");
    });

    it("should resolve agentId from node.config.agentId as fallback", async () => {
      const flowWithConfigAgentId: FlowDefinition = {
        ...singleAgentFlow,
        graph: {
          ...singleAgentFlow.graph,
          nodes: singleAgentFlow.graph.nodes.map((n) =>
            n.nodeId === "main-agent"
              ? { ...n, agentId: undefined, config: { ...n.config, agentId: "test-agent" } }
              : n,
          ),
        },
      };

      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(flowWithConfigAgentId, { userPrompt: "Hello" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });

    it("should throw when agentRef does not match any agentDef", async () => {
      // Create a flow where agentRef points to a nonexistent agent
      const badAgentRefFlow: FlowDefinition = {
        ...singleAgentFlow,
        graph: {
          ...singleAgentFlow.graph,
          nodes: singleAgentFlow.graph.nodes.map((n) =>
            n.nodeId === "main-agent"
              ? { ...n, agentId: undefined, agentRef: "nonexistent-agent" }
              : n,
          ),
        },
      };

      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const failedEvents = collectEvents(scheduler, "run_failed");

      const runId = await scheduler.startRun(badAgentRefFlow);
      const result = await waitForRun(scheduler, runId);

      expect(result).toBe("failed");
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      const errorPayload = failedEvents[0]!.payload as { error: string };
      expect(errorPayload.error).toContain("has no agentId");
    });
  });

  // ─── Loader Node Driver ─────────────────────────────────────

  describe("executeLoaderNode", () => {
    it("should propagate input to data output port for loader nodes", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const input = { userPrompt: "Load this", data: { files: ["a.ts", "b.ts"] } };

      const runId = await scheduler.startRun(loaderAgentFlow, input);
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });
  });

  // ─── Control Node Driver ────────────────────────────────────

  describe("executeControlNode", () => {
    it("should complete the run when control.finish is reached", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const completedEvents = collectEvents(scheduler, "run_completed");

      const runId = await scheduler.startRun(singleAgentFlow);
      await waitForRun(scheduler, runId);

      expect(completedEvents.length).toBe(1);
      const payload = completedEvents[0]!.payload as { iteration: number };
      expect(payload.iteration).toBeGreaterThanOrEqual(1); // at least agent + finish processed
    });
  });

  // ─── Pause / Resume / Abort ─────────────────────────────────

  describe("pauseRun / resumeRun / abortRun", () => {
    it("should track run state after creation", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(singleAgentFlow);
      const ctx = scheduler.getRunState(runId);
      // Run may already be completed by the time we check
      expect(ctx).toBeDefined();
      expect(ctx!.runId).toBe(runId);
    });

    it("should abort a run and mark it as failed", async () => {
      // Use a slow adapter to ensure we can abort before completion
      const slowAdapter = new FakeAgentAdapter({ turnDelayMs: 5000 });
      const scheduler = new FlowScheduler(createFakeAdapterResolver(slowAdapter));

      const runId = await scheduler.startRun(singleAgentFlow);

      // Abort immediately
      scheduler.abortRun(runId);

      const ctx = scheduler.getRunState(runId);
      expect(ctx?.state).toBe("failed");
    });
  });

  // ─── Event Emission ─────────────────────────────────────────

  describe("event emission", () => {
    it("should emit agent_selected and turn_completed for each agent node", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const selectedEvents = collectEvents(scheduler, "agent_selected");
      const completedEvents = collectEvents(scheduler, "turn_completed");

      const runId = await scheduler.startRun(singleAgentFlow, { userPrompt: "Test" });
      await waitForRun(scheduler, runId);

      // Should have at least 1 agent_selected (for the agent node)
      // and 1 turn_completed (for the agent node)
      expect(selectedEvents.length).toBeGreaterThanOrEqual(1);
      expect(completedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("should emit events with correct runId and nodeId", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const selectedEvents = collectEvents(scheduler, "agent_selected");

      const runId = await scheduler.startRun(singleAgentFlow, { userPrompt: "Test" });
      await waitForRun(scheduler, runId);

      const agentEvent = selectedEvents.find((e) => (e as any).nodeId === "main-agent");
      expect(agentEvent).toBeDefined();
      expect(agentEvent!.runId).toBe(runId);
    });
  });

  // ─── Node Kind Dispatch ─────────────────────────────────────

  describe("node kind dispatch", () => {
    it("should dispatch agent.main nodes to executeAgentNode", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(singleAgentFlow, { userPrompt: "Test" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });

    it("should dispatch loader.* nodes to executeLoaderNode", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const turnEvents = collectEvents(scheduler, "turn_completed");

      const runId = await scheduler.startRun(loaderAgentFlow);
      await waitForRun(scheduler, runId);

      // Loader should emit a turn_completed with status: "pass-through"
      const loaderEvent = turnEvents.find((e) =>
        (e as any).nodeId === "loader" &&
        ((e as any).payload as Record<string, unknown>)?.status === "pass-through",
      );
      expect(loaderEvent).toBeDefined();
    });

    it("should skip unknown node kinds", async () => {
      const unknownKindFlow: FlowDefinition = {
        ...singleAgentFlow,
        graph: {
          ...singleAgentFlow.graph,
          nodes: [
            {
              nodeId: "unknown-node",
              nodeKind: "custom.unknown",
              label: "Unknown",
              config: {},
              inputPorts: [],
              outputPorts: [],
              params: [],
            },
          ],
          edges: [],
          startNodeId: "unknown-node",
        },
      };

      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const turnEvents = collectEvents(scheduler, "turn_completed");

      const runId = await scheduler.startRun(unknownKindFlow);
      const result = await waitForRun(scheduler, runId);

      // Unknown kind should be skipped, flow completes
      expect(result).toBe("completed");
      const skippedEvent = turnEvents.find((e) =>
        ((e as any).payload as Record<string, unknown>)?.skipped === true,
      );
      expect(skippedEvent).toBeDefined();
    });

    it("should handle legacy nodeType='agent' as agent node", async () => {
      const legacyFlow: FlowDefinition = {
        ...singleAgentFlow,
        graph: {
          ...singleAgentFlow.graph,
          nodes: singleAgentFlow.graph.nodes.map((n) =>
            n.nodeId === "main-agent"
              ? { ...n, nodeKind: undefined, nodeType: "agent" as const }
              : n,
          ),
        },
      };

      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(legacyFlow, { userPrompt: "Test" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });
  });

  // ─── Port Value Propagation ─────────────────────────────────

  describe("port value propagation", () => {
    it("should propagate data through data edges between agent nodes", async () => {
      const scheduler = new FlowScheduler(createFakeAdapterResolver());
      const runId = await scheduler.startRun(dataEdgeFlow, { userPrompt: "Test data propagation" });
      const result = await waitForRun(scheduler, runId);
      expect(result).toBe("completed");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// RunContext Tests
// ═══════════════════════════════════════════════════════════

describe("RunContext", () => {
  it("should initialize with running state", () => {
    const ctx = new RunContext("run-1", singleAgentFlow);
    expect(ctx.state).toBe("running");
    expect(ctx.runId).toBe("run-1");
    expect(ctx.iteration).toBe(0);
  });

  // ─── Port Value Store ───────────────────────────────────────

  describe("port values", () => {
    it("should set and get port values", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.setPortValue("node-a", "out", "hello");
      expect(ctx.getPortValue("node-a", "out")).toBe("hello");
    });

    it("should return undefined for unset port values", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.getPortValue("node-a", "out")).toBeUndefined();
    });

    it("should return all port values for a node", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.setPortValue("node-a", "out", "hello");
      ctx.setPortValue("node-a", "result", 42);
      const ports = ctx.getNodePortValues("node-a");
      expect(ports.get("out")).toBe("hello");
      expect(ports.get("result")).toBe(42);
    });
  });

  // ─── Node Output Store ──────────────────────────────────────

  describe("node outputs", () => {
    it("should store and retrieve node outputs", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      const mockResult = {
        invocationId: "inv-1",
        status: "completed" as const,
        finalText: "Done",
      };
      ctx.setNodeOutput("node-a", mockResult);
      expect(ctx.getNodeOutput("node-a")).toEqual(mockResult);
    });

    it("should return undefined for unset node outputs", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.getNodeOutput("node-a")).toBeUndefined();
    });
  });

  // ─── Loop Counter ───────────────────────────────────────────

  describe("loop counters", () => {
    it("should increment and read loop counters", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.incrementLoop("loop-1")).toBe(1);
      expect(ctx.incrementLoop("loop-1")).toBe(2);
      expect(ctx.getLoopCount("loop-1")).toBe(2);
    });

    it("should reset loop counters", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.incrementLoop("loop-1");
      ctx.incrementLoop("loop-1");
      ctx.resetLoop("loop-1");
      expect(ctx.getLoopCount("loop-1")).toBe(0);
    });

    it("should return 0 for unknown loop nodes", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.getLoopCount("unknown")).toBe(0);
    });
  });

  // ─── Active Output Handle ───────────────────────────────────

  describe("active output handle", () => {
    it("should set and get active output handle", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.getActiveOutputHandle()).toBeUndefined();
      ctx.setActiveOutputHandle("plan");
      expect(ctx.getActiveOutputHandle()).toBe("plan");
    });
  });

  // ─── State Transitions ──────────────────────────────────────

  describe("state transitions", () => {
    it("should transition to completed", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.complete();
      expect(ctx.state).toBe("completed");
      expect(ctx.completedAt).toBeDefined();
    });

    it("should transition to failed", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.fail();
      expect(ctx.state).toBe("failed");
      expect(ctx.completedAt).toBeDefined();
    });
  });

  // ─── Next Node Resolution ───────────────────────────────────

  describe("getNextNodeId", () => {
    it("should return startNodeId when no current node", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      expect(ctx.getNextNodeId()).toBe("main-agent");
    });

    it("should follow edges to next node", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.currentNodeId = "main-agent";
      expect(ctx.getNextNodeId()).toBe("finish");
    });

    it("should return undefined when no outgoing edges", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      ctx.currentNodeId = "finish";
      expect(ctx.getNextNodeId()).toBeUndefined();
    });

    it("should follow sourceHandle-matched edges when activeOutputHandle is set", () => {
      const ctx = new RunContext("run-1", dataEdgeFlow);
      ctx.currentNodeId = "agent-a";
      // Without active handle, should follow first edge
      const nextId = ctx.getNextNodeId();
      expect(nextId).toBe("agent-b");
    });
  });

  // ─── Node Trace Store ───────────────────────────────────────

  describe("node traces", () => {
    it("should store and retrieve node traces", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      const trace = {
        nodeId: "node-a",
        runId: "run-1",
        inputTraces: [],
        outputTraces: [],
        promptSources: [],
        durationMs: 100,
        startedAt: 1000,
        completedAt: 1100,
      };
      ctx.setNodeTrace("node-a", trace as any);
      expect(ctx.getNodeTrace("node-a")).toEqual(trace);
    });

    it("should return all node traces", () => {
      const ctx = new RunContext("run-1", singleAgentFlow);
      const traces = ctx.getAllNodeTraces();
      expect(traces.size).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// EventBus Tests
// ═══════════════════════════════════════════════════════════

describe("EventBus", () => {
  it("should subscribe and emit events to specific listeners", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];
    bus.on("run_started" as any, (e: any) => received.push(e));

    bus.emit({
      eventType: "run_started" as any,
      runId: "run-1",
      payload: { flowName: "Test" },
    });

    expect(received.length).toBe(1);
    expect(received[0]!.runId).toBe("run-1");
    expect(received[0]!.payload).toEqual({ flowName: "Test" });
  });

  it("should support wildcard listeners", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];
    bus.on("*", (e: any) => received.push(e));

    bus.emit({
      eventType: "run_started" as any,
      runId: "run-1",
      payload: {},
    });
    bus.emit({
      eventType: "run_completed" as any,
      runId: "run-1",
      payload: {},
    });

    expect(received.length).toBe(2);
  });

  it("should return unsubscribe function that removes listener", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];
    const unsub = bus.on("run_started" as any, (e: any) => received.push(e));

    bus.emit({ eventType: "run_started" as any, runId: "run-1", payload: {} });
    expect(received.length).toBe(1);

    unsub();
    bus.emit({ eventType: "run_started" as any, runId: "run-2", payload: {} });
    expect(received.length).toBe(1); // No new event
  });

  it("should not propagate listener errors", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];

    // This listener throws
    bus.on("run_started" as any, () => { throw new Error("Listener error"); });
    // This listener should still be called
    bus.on("run_started" as any, (e: any) => received.push(e));

    // Should not throw
    bus.emit({ eventType: "run_started" as any, runId: "run-1", payload: {} });
    expect(received.length).toBe(1);
  });

  it("should include eventId, timestamp, and schemaVersion in emitted events", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];
    bus.on("run_started" as any, (e: any) => received.push(e));

    bus.emit({ eventType: "run_started" as any, runId: "run-1", payload: {} });

    expect(received[0]!.eventId).toBeDefined();
    expect(received[0]!.timestamp).toBeDefined();
    expect(received[0]!.schemaVersion).toBe("1.0");
  });

  it("should clear all listeners", () => {
    const bus = new EventBus();
    const received: Array<Record<string, unknown>> = [];
    bus.on("run_started" as any, (e: any) => received.push(e));

    bus.clear();
    bus.emit({ eventType: "run_started" as any, runId: "run-1", payload: {} });
    expect(received.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// SubagentArbiter Tests
// ═══════════════════════════════════════════════════════════

describe("SubagentArbiter", () => {
  const arbiter = new SubagentArbiter();

  const sourceAgentDef = {
    agentId: "planner",
    adapterKind: "fake",
    subagentPolicy: {
      allowedAgents: ["executor"],
      switchModes: ["agent-suggested" as const, "policy-resolved" as const],
      returnStrategy: "summary-only" as const,
      maxDelegations: 3,
    },
  };

  it("should approve a valid subagent switch request", () => {
    const request = {
      requestId: "req-1",
      sourceInvocationId: "inv-1",
      sourceAgentId: "planner",
      requestedAgentId: "executor",
      mode: "agent-suggested" as const,
      reason: "Need execution",
      taskEnvelope: { task: "Execute the plan" },
      returnStrategy: "summary-only" as const,
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, sourceAgentDef as any);
    expect(decision.decision).toBe("approved");
    expect(decision.resolvedAgentId).toBe("executor");
  });

  it("should reject when switch mode is not allowed", () => {
    const request = {
      requestId: "req-2",
      sourceInvocationId: "inv-2",
      sourceAgentId: "planner",
      requestedAgentId: "executor",
      mode: "agent-suggested" as const,
      reason: "Need execution",
      taskEnvelope: { task: "Execute" },
      returnStrategy: "summary-only" as const,
    };

    const restrictedPolicy = {
      ...sourceAgentDef,
      subagentPolicy: {
        allowedAgents: ["executor"],
        switchModes: [] as string[], // No modes allowed
        returnStrategy: "summary-only" as const,
      },
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, restrictedPolicy as any);
    expect(decision.decision).toBe("rejected");
  });

  it("should reject when target agent is not in allowlist", () => {
    const request = {
      requestId: "req-3",
      sourceInvocationId: "inv-3",
      sourceAgentId: "planner",
      requestedAgentId: "unknown-agent",
      mode: "agent-suggested" as const,
      reason: "Need unknown agent",
      taskEnvelope: { task: "Do something" },
      returnStrategy: "summary-only" as const,
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, sourceAgentDef as any);
    expect(decision.decision).toBe("rejected");
  });

  it("should reject when target agent does not exist in flow", () => {
    const request = {
      requestId: "req-4",
      sourceInvocationId: "inv-4",
      sourceAgentId: "planner",
      requestedAgentId: "nonexistent",
      mode: "agent-suggested" as const,
      reason: "Need nonexistent",
      taskEnvelope: { task: "Do something" },
      returnStrategy: "summary-only" as const,
    };

    // Allow all agents but "nonexistent" doesn't exist in flow
    const allowAllPolicy = {
      ...sourceAgentDef,
      subagentPolicy: {
        allowedAgents: [] as string[], // Empty = allow all
        switchModes: ["agent-suggested" as const],
        returnStrategy: "summary-only" as const,
      },
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, allowAllPolicy as any);
    expect(decision.decision).toBe("rejected");
  });

  it("should always allow flow-forced mode", () => {
    const request = {
      requestId: "req-5",
      sourceInvocationId: "inv-5",
      sourceAgentId: "planner",
      requestedAgentId: "executor",
      mode: "flow-forced" as const,
      reason: "Flow-forced delegation",
      taskEnvelope: { task: "Execute" },
      returnStrategy: "summary-only" as const,
    };

    const restrictedPolicy = {
      ...sourceAgentDef,
      subagentPolicy: {
        allowedAgents: ["executor"],
        switchModes: [] as string[], // No modes allowed (but flow-forced bypasses)
        returnStrategy: "summary-only" as const,
      },
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, restrictedPolicy as any);
    expect(decision.decision).toBe("approved");
  });

  it("should reject when delegation budget is exhausted", () => {
    const request = {
      requestId: "req-6",
      sourceInvocationId: "inv-6",
      sourceAgentId: "planner",
      requestedAgentId: "executor",
      mode: "agent-suggested" as const,
      reason: "Need execution",
      taskEnvelope: { task: "Execute" },
      returnStrategy: "summary-only" as const,
    };

    const exhaustedPolicy = {
      ...sourceAgentDef,
      subagentPolicy: {
        allowedAgents: ["executor"],
        switchModes: ["agent-suggested" as const],
        returnStrategy: "summary-only" as const,
        maxDelegations: 0, // Budget exhausted
      },
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, exhaustedPolicy as any);
    expect(decision.decision).toBe("rejected");
  });

  it("should include policy trace in decisions", () => {
    const request = {
      requestId: "req-7",
      sourceInvocationId: "inv-7",
      sourceAgentId: "planner",
      requestedAgentId: "executor",
      mode: "agent-suggested" as const,
      reason: "Need execution",
      taskEnvelope: { task: "Execute" },
      returnStrategy: "summary-only" as const,
    };

    const decision = arbiter.arbitrate(request, multiAgentFlow, sourceAgentDef as any);
    expect(decision.policyTrace!.length).toBeGreaterThan(0);
    expect(decision.policyTrace![0]!.ruleName).toBeDefined();
    expect(decision.policyTrace![0]!.result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// NodeExecutor Tests
// ═══════════════════════════════════════════════════════════

describe("NodeExecutor", () => {
  it("should execute a node and return turn result with trace", async () => {
    const eventBus = new EventBus();
    const executor = new NodeExecutor(eventBus);
    const adapter = new FakeAgentAdapter({ responseText: "Test result" });

    const node: FlowDefinition["graph"]["nodes"][number] = {
      nodeId: "test-node",
      nodeKind: "agent.main",
      agentId: "test-agent",
      config: { turnMode: "normal" },
      inputPorts: [],
      outputPorts: [],
      params: [],
    };

    const flow: FlowDefinition = {
      ...singleAgentFlow,
      agents: {
        agentDefs: [
          {
            agentId: "test-agent",
            adapterKind: "fake",
            modelProfile: {},
            toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
            memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
            subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
            timeouts: { turnMs: 60000, sessionMs: 300000 },
            budgets: {},
          },
        ],
      },
    };

    const snapshot = {
      runId: "run-test",
      input: { userPrompt: "Hello" },
      messages: [],
      toolSurface: {
        surfaceId: "surface-test",
        allowedCapabilities: [],
        tools: [],
        policy: { readOnly: true, allowDestructive: false, approvalRequirement: "destructive_only" as const },
        invoke: async () => ({ ok: true }),
        describeForModel: () => "",
      },
      memoryPolicy: { visibleScopes: ["run"] as const, writableScopes: [] as const },
      iteration: 0,
      turnMode: "normal" as const,
    };

    const result = await executor.executeNode(node, flow, adapter, snapshot);

    expect(result.turnResult.status).toBe("completed");
    expect(result.turnResult.finalText).toBeDefined();
    expect(result.trace.nodeId).toBe("test-node");
    expect(result.trace.runId).toBe("run-test");
    expect(result.trace.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should reuse session for same runId + agentId", async () => {
    const eventBus = new EventBus();
    const executor = new NodeExecutor(eventBus);
    const adapter = new FakeAgentAdapter();

    const node: FlowDefinition["graph"]["nodes"][number] = {
      nodeId: "test-node",
      nodeKind: "agent.main",
      agentId: "test-agent",
      config: { turnMode: "normal" },
      inputPorts: [],
      outputPorts: [],
      params: [],
    };

    const flow: FlowDefinition = {
      ...singleAgentFlow,
      agents: {
        agentDefs: [
          {
            agentId: "test-agent",
            adapterKind: "fake",
            modelProfile: {},
            toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
            memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
            subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
            timeouts: { turnMs: 60000, sessionMs: 300000 },
            budgets: {},
          },
        ],
      },
    };

    const baseSnapshot = {
      runId: "run-session-test",
      input: { userPrompt: "Hello" },
      messages: [],
      toolSurface: {
        surfaceId: "surface-test",
        allowedCapabilities: [],
        tools: [],
        policy: { readOnly: true, allowDestructive: false, approvalRequirement: "destructive_only" as const },
        invoke: async () => ({ ok: true }),
        describeForModel: () => "",
      },
      memoryPolicy: { visibleScopes: ["run"] as const, writableScopes: [] as const },
      iteration: 0,
      turnMode: "normal" as const,
    };

    // Execute twice with same runId — should reuse session
    const result1 = await executor.executeNode(node, flow, adapter, baseSnapshot);
    const result2 = await executor.executeNode(node, flow, adapter, baseSnapshot);

    expect(result1.turnResult.status).toBe("completed");
    expect(result2.turnResult.status).toBe("completed");
  });

  it("should dispose sessions for a run", async () => {
    const eventBus = new EventBus();
    const executor = new NodeExecutor(eventBus);

    const node: FlowDefinition["graph"]["nodes"][number] = {
      nodeId: "test-node",
      nodeKind: "agent.main",
      agentId: "test-agent",
      config: { turnMode: "normal" },
      inputPorts: [],
      outputPorts: [],
      params: [],
    };

    const flow: FlowDefinition = {
      ...singleAgentFlow,
      agents: {
        agentDefs: [
          {
            agentId: "test-agent",
            adapterKind: "fake",
            modelProfile: {},
            toolPolicy: { allowedCapabilities: [], blockedTools: [], approvalRequirement: "destructive_only" },
            memoryPolicy: { visibleScopes: ["run"], writableScopes: [] },
            subagentPolicy: { allowedAgents: [], switchModes: [], returnStrategy: "summary-only" },
            timeouts: { turnMs: 60000, sessionMs: 300000 },
            budgets: {},
          },
        ],
      },
    };

    const snapshot = {
      runId: "run-dispose-test",
      input: { userPrompt: "Hello" },
      messages: [],
      toolSurface: {
        surfaceId: "surface-test",
        allowedCapabilities: [],
        tools: [],
        policy: { readOnly: true, allowDestructive: false, approvalRequirement: "destructive_only" as const },
        invoke: async () => ({ ok: true }),
        describeForModel: () => "",
      },
      memoryPolicy: { visibleScopes: ["run"] as const, writableScopes: [] as const },
      iteration: 0,
      turnMode: "normal" as const,
    };

    const adapter = new FakeAgentAdapter();
    await executor.executeNode(node, flow, adapter, snapshot);
    await executor.disposeRun("run-dispose-test");
    // Should not throw
  });
});

// ═══════════════════════════════════════════════════════════
// Golden Fixture Tests
// ═══════════════════════════════════════════════════════════

describe("golden flow fixtures", () => {
  it("should execute minimalFlow from testing-kit", async () => {
    const scheduler = new FlowScheduler(createFakeAdapterResolver());
    const runId = await scheduler.startRun(minimalFlow);
    const result = await waitForRun(scheduler, runId);
    expect(result).toBe("completed");
  });

  it("should execute multiAgentFlow from testing-kit", async () => {
    const scheduler = new FlowScheduler(createFakeAdapterResolver());
    const runId = await scheduler.startRun(multiAgentFlow, { userPrompt: "Test" });
    const result = await waitForRun(scheduler, runId);
    expect(result).toBe("completed");
  });
});
