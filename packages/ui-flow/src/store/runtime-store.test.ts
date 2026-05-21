import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter } from "@agentsflow/agent-contracts";
import type { FlowDefinition } from "@agentsflow/flow-schema";
import type {
  PiMonoCreateSessionRequest,
  PiMonoTransport,
  PiMonoTurnRequest,
} from "@agentsflow/pi-mono-runtime";
import { PiMonoAgentAdapter } from "@agentsflow/pi-mono-runtime";
import {
  listRuntimeAdapterExtensions,
  registerRuntimeAdapterExtension,
  unregisterRuntimeAdapterExtension,
} from "../lib/runtime-adapter-registry.js";
import { useRuntimeStore } from "./runtime-store.js";

const TEST_ADAPTER_KIND = "test-rich-transcript";
const PI_MONO_ADAPTER_KIND = "pi-mono";

const richTranscriptFlow: FlowDefinition = {
  meta: {
    schemaVersion: "1.0",
    name: "Rich Transcript Flow",
    version: "0.1.0",
    tags: ["test", "assistant-panel"],
  },
  agents: {
    agentDefs: [
      {
        agentId: "rich-agent",
        adapterKind: TEST_ADAPTER_KIND,
        modelProfile: {
          systemPrompt: "You are a test assistant.",
        },
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
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "Main Agent",
        agentId: "rich-agent",
        config: {
          turnMode: "normal",
        },
        inputPorts: [],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
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
      { source: "main-agent", target: "finish", dataEdge: false },
    ],
    startNodeId: "main-agent",
  },
  runtime: {
    maxConcurrency: 1,
    defaultTurnTimeoutMs: 60000,
    persistEvents: true,
    persistMemorySnapshots: false,
  },
  layout: {
    positions: [
      { nodeId: "main-agent", x: 100, y: 100 },
      { nodeId: "finish", x: 300, y: 100 },
    ],
    nodeBindings: [{ nodeId: "main-agent", agentId: "rich-agent" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: {
    customNodeSpecs: [],
  },
};

const piMonoTranscriptFlow: FlowDefinition = {
  meta: {
    schemaVersion: "1.0",
    name: "Pi Mono Transcript Flow",
    version: "0.1.0",
    tags: ["test", "pi-mono"],
  },
  agents: {
    agentDefs: [
      {
        agentId: "pi-mono-agent",
        adapterKind: PI_MONO_ADAPTER_KIND,
        modelProfile: {
          model: "pi-mono-code",
          systemPrompt: "You are a code-generation assistant.",
          temperature: 0.35,
        },
        adapterConfig: {
          baseUrl: "http://pi-mono.local",
          outputDir: "/tmp/out/3d-snake",
          workspaceRoot: "/workspace/demo",
        },
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
        nodeId: "main-agent",
        nodeKind: "agent.main",
        label: "PiMono Agent",
        agentId: "pi-mono-agent",
        config: {
          turnMode: "normal",
        },
        inputPorts: [],
        outputPorts: [
          { portId: "out", dataType: "any", required: true },
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
      { source: "main-agent", target: "finish", dataEdge: false },
    ],
    startNodeId: "main-agent",
  },
  runtime: {
    maxConcurrency: 1,
    defaultTurnTimeoutMs: 60000,
    persistEvents: true,
    persistMemorySnapshots: false,
  },
  layout: {
    positions: [
      { nodeId: "main-agent", x: 100, y: 100 },
      { nodeId: "finish", x: 300, y: 100 },
    ],
    nodeBindings: [{ nodeId: "main-agent", agentId: "pi-mono-agent" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  extensions: {
    customNodeSpecs: [],
  },
};

function createRichTranscriptAdapter(): AgentAdapter {
  return {
    metadata: {
      adapterKind: TEST_ADAPTER_KIND,
      displayName: "Rich Transcript Test Adapter",
      adapterVersion: "0.1.0",
      contractVersion: "0.1.0",
      supportedCapabilities: ["structured-output", "tool-calls"],
    },
    async createSession(context) {
      return {
        sessionId: `rich-session-${context.runId}`,
        adapterKind: TEST_ADAPTER_KIND,
      };
    },
    async runTurn(invocation) {
      return {
        invocationId: invocation.invocationId,
        status: "completed",
        finalText: "Assistant completed the requested task.",
        structuredOutput: {
          summary: "Task finished",
          score: 0.92,
        },
        reasoningText: "Checked the request, used one tool, and prepared one file artifact.",
        toolCalls: [
          {
            toolCallId: "tool-1",
            toolName: "workspace.writeFile",
            status: "success",
            durationMs: 12,
          },
        ],
        artifacts: [
          {
            artifactId: "artifact-1",
            artifactType: "file",
            path: "/tmp/generated-plan.md",
            description: "Generated plan output",
          },
        ],
        usage: {
          inputTokens: 120,
          outputTokens: 48,
          totalTokens: 168,
          durationMs: 25,
          steps: 2,
        },
        warnings: ["Test warning"],
      };
    },
    async abort() {
      return;
    },
    async dispose() {
      return;
    },
    validateConfig() {
      return [];
    },
    mapCapabilities(requestedCapabilities) {
      return [...requestedCapabilities];
    },
  };
}

async function waitForCompletedRun(flowPath: string): Promise<NonNullable<ReturnType<typeof useRuntimeStore.getState>["runsByFlowPath"] extends ReadonlyMap<string, infer T> ? T : never>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const run = useRuntimeStore.getState().runsByFlowPath.get(flowPath);
    if (run?.state === "completed") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for run ${flowPath} to complete.`);
}

function registerBuiltinPiMonoExtension(): void {
  registerRuntimeAdapterExtension({
    adapterKind: PI_MONO_ADAPTER_KIND,
    displayName: "pi-mono",
    createAdapter: ({ flow, agentDef }) => new PiMonoAgentAdapter({
      flowName: flow.meta.name,
      ...(agentDef.modelProfile?.model !== undefined ? { model: agentDef.modelProfile.model } : {}),
      ...(agentDef.modelProfile?.temperature !== undefined ? { temperature: agentDef.modelProfile.temperature } : {}),
      ...(agentDef.adapterConfig !== undefined ? { adapterConfig: agentDef.adapterConfig } : {}),
    }),
  });
}

afterEach(() => {
  unregisterRuntimeAdapterExtension(TEST_ADAPTER_KIND);
  unregisterRuntimeAdapterExtension(PI_MONO_ADAPTER_KIND);
  registerBuiltinPiMonoExtension();
  useRuntimeStore.setState({ runsByFlowPath: new Map() });
});

describe("runtime transcript state", () => {
  it("registers pi-mono as a builtin runtime adapter", () => {
    expect(listRuntimeAdapterExtensions().some((extension) => extension.adapterKind === PI_MONO_ADAPTER_KIND)).toBe(true);
  });

  it("stores user and assistant timeline entries with reasoning, tools, artifacts, and usage", async () => {
    registerRuntimeAdapterExtension({
      adapterKind: TEST_ADAPTER_KIND,
      displayName: "Rich Transcript Test Adapter",
      createAdapter: () => createRichTranscriptAdapter(),
    });

    const flowPath = "/virtual/rich-transcript.flow.yaml";
    await useRuntimeStore.getState().startFlow(flowPath, richTranscriptFlow, {
      userPrompt: "Please complete the task and show your working.",
    });

    const run = await waitForCompletedRun(flowPath);

    expect(run.timeline).toHaveLength(2);
    expect(run.timeline[0]).toMatchObject({
      role: "user",
      title: "User",
      content: "Please complete the task and show your working.",
    });
    expect(run.timeline[1]).toMatchObject({
      role: "assistant",
      title: "Main Agent",
      content: "Assistant completed the requested task.",
      reasoningText: "Checked the request, used one tool, and prepared one file artifact.",
      toolCalls: [
        {
          toolName: "workspace.writeFile",
          status: "success",
        },
      ],
      artifacts: [
        {
          path: "/tmp/generated-plan.md",
          artifactType: "file",
        },
      ],
      warnings: ["Test warning"],
    });
    expect(run.timeline[1]?.usage).toMatchObject({
      totalTokens: 168,
      steps: 2,
    });

    const nodeState = run.nodeStates.get("main-agent");
    expect(nodeState).toMatchObject({
      status: "completed",
      finalText: "Assistant completed the requested task.",
      reasoningText: "Checked the request, used one tool, and prepared one file artifact.",
      warnings: ["Test warning"],
    });
    expect(nodeState?.toolCalls?.[0]).toMatchObject({
      toolName: "workspace.writeFile",
      status: "success",
    });
    expect(nodeState?.artifacts?.[0]).toMatchObject({
      path: "/tmp/generated-plan.md",
    });
  });

  it("runs pi-mono through the runtime store and preserves request mapping plus artifacts", async () => {
    let capturedSessionRequest: PiMonoCreateSessionRequest | undefined;
    let capturedTurnRequest: PiMonoTurnRequest | undefined;

    const transport: PiMonoTransport = {
      async createSession(request) {
        capturedSessionRequest = request;
        return {
          sessionId: `pi-mono-session-${request.runId}`,
        };
      },
      async runTurn(request) {
        capturedTurnRequest = request;
        return {
          finalText: "Generated 3D snake scaffold into /tmp/out/3d-snake.",
          structuredOutput: {
            outputDir: "/tmp/out/3d-snake",
            files: ["main.ts", "scene.json"],
          },
          reasoningText: "Created the initial scaffold, wrote entrypoint files, and prepared the output directory.",
          toolCalls: [
            {
              toolCallId: "pi-tool-1",
              toolName: "workspace.writeFile",
              status: "success",
              durationMs: 21,
            },
          ],
          artifacts: [
            {
              artifactId: "artifact-main",
              artifactType: "file",
              path: "/tmp/out/3d-snake/main.ts",
              description: "Game bootstrap file",
            },
          ],
          usage: {
            inputTokens: 220,
            outputTokens: 96,
            totalTokens: 316,
            durationMs: 77,
            steps: 3,
          },
          warnings: ["Used stub pi-mono transport for test coverage."],
        };
      },
      async abort() {
        return;
      },
      async dispose() {
        return;
      },
      validateConfig() {
        return [];
      },
      mapCapabilities(requestedCapabilities) {
        return [...requestedCapabilities];
      },
    };

    registerRuntimeAdapterExtension({
      adapterKind: PI_MONO_ADAPTER_KIND,
      displayName: "pi-mono",
      createAdapter: ({ flow, agentDef }) => new PiMonoAgentAdapter({
        flowName: flow.meta.name,
        ...(agentDef.modelProfile?.model !== undefined ? { model: agentDef.modelProfile.model } : {}),
        ...(agentDef.modelProfile?.temperature !== undefined ? { temperature: agentDef.modelProfile.temperature } : {}),
        ...(agentDef.adapterConfig !== undefined ? { adapterConfig: agentDef.adapterConfig } : {}),
        transport,
      }),
    });

    const flowPath = "/virtual/pi-mono-transcript.flow.yaml";
    await useRuntimeStore.getState().startFlow(flowPath, piMonoTranscriptFlow, {
      userPrompt: "Implement a 3D snake prototype and output it to /tmp/out/3d-snake.",
    });

    const run = await waitForCompletedRun(flowPath);

    expect(capturedSessionRequest).toMatchObject({
      flowName: "Pi Mono Transcript Flow",
      model: "pi-mono-code",
      temperature: 0.35,
      adapterConfig: {
        baseUrl: "http://pi-mono.local",
        outputDir: "/tmp/out/3d-snake",
        workspaceRoot: "/workspace/demo",
      },
    });
    expect(capturedTurnRequest).toMatchObject({
      turnMode: "normal",
      flowName: "Pi Mono Transcript Flow",
      model: "pi-mono-code",
      adapterConfig: {
        baseUrl: "http://pi-mono.local",
        outputDir: "/tmp/out/3d-snake",
        workspaceRoot: "/workspace/demo",
      },
    });
    expect(capturedTurnRequest?.prompt).toContain("Implement a 3D snake prototype");

    expect(run.timeline).toHaveLength(2);
    expect(run.timeline[1]).toMatchObject({
      role: "assistant",
      title: "PiMono Agent",
      content: "Generated 3D snake scaffold into /tmp/out/3d-snake.",
      reasoningText: "Created the initial scaffold, wrote entrypoint files, and prepared the output directory.",
      warnings: ["Used stub pi-mono transport for test coverage."],
      toolCalls: [
        {
          toolName: "workspace.writeFile",
          status: "success",
        },
      ],
      artifacts: [
        {
          path: "/tmp/out/3d-snake/main.ts",
          artifactType: "file",
        },
      ],
    });
    expect(run.timeline[1]?.usage).toMatchObject({
      totalTokens: 316,
      steps: 3,
    });

    const nodeState = run.nodeStates.get("main-agent");
    expect(nodeState).toMatchObject({
      status: "completed",
      finalText: "Generated 3D snake scaffold into /tmp/out/3d-snake.",
      reasoningText: "Created the initial scaffold, wrote entrypoint files, and prepared the output directory.",
    });
    expect(nodeState?.artifacts?.[0]).toMatchObject({
      path: "/tmp/out/3d-snake/main.ts",
    });
  });
});