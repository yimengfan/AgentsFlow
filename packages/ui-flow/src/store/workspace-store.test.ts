import { describe, expect, it } from "vitest";
import { useWorkspaceStore } from "./workspace-store.js";

describe("workspace starter flow", () => {
  it("creates the default linear agent flow with pi-mono agents using DeepSeek transport", () => {
    const flowPath = useWorkspaceStore.getState().createFlow();
    const document = useWorkspaceStore.getState().documents.get(flowPath);
    const flow = document?.flow;

    expect(flow).not.toBeNull();
    expect(flow?.graph.nodes.some((node) => node.nodeKind === "control.plan-loop")).toBe(false);
    expect(flow?.graph.nodes.map((node) => node.nodeId)).toEqual([
      "loader-workdir",
      "main-prompt",
      "sub-execute",
      "main-evaluate",
      "finish",
    ]);
    expect(flow?.graph.edges.map((edge) => `${edge.source}:${edge.target}`)).toEqual([
      "loader-workdir:main-prompt",
      "loader-workdir:main-prompt",
      "main-prompt:sub-execute",
      "main-prompt:sub-execute",
      "sub-execute:main-evaluate",
      "sub-execute:main-evaluate",
      "main-evaluate:finish",
      "main-evaluate:finish",
    ]);
    expect(flow?.agents.agentDefs.map((agent) => agent.adapterKind)).toEqual(["pi-mono", "pi-mono"]);
    expect(flow?.agents.agentDefs.map((agent) => agent.adapterConfig)).toEqual([
      { transport: "deepseek" },
      { transport: "deepseek" },
    ]);
    expect(flow?.graph.nodes.find((node) => node.nodeId === "main-prompt")?.config).toMatchObject({
      turnMode: "plan",
    });
    expect(flow?.graph.nodes.find((node) => node.nodeId === "main-evaluate")?.config).toMatchObject({
      turnMode: "evaluate",
    });
  });
});