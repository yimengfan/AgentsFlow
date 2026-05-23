import { describe, it, expect } from "vitest";
import type { ScannerFs } from "../src/types.js";
import { scanAgentsFlowDir } from "../src/scanner.js";
import { parseAgentFile, parseInstructionFile, parseSkillFile } from "../src/parser.js";
import { resolvePromptAssetManifest } from "../src/resolver.js";
import { assemblePromptPackage } from "../src/prompt-assembler.js";
import { BuiltInProviderAdapter, builtInAdapter } from "../src/provider-package.js";
import { ProviderAdapterRegistry } from "../src/adapter-registry.js";
import type {
  PromptAssetManifest,
  ResolvedAgentAsset,
  ResolvedInstructionAsset,
  ResolvedSkillAsset,
} from "@agentsflow/flow-schema";

// ---------------------------------------------------------------------------
// Test fixture: in-memory ScannerFs
// ---------------------------------------------------------------------------

/**
 * Build a ScannerFs backed by an in-memory file map.
 * Keys are paths (e.g. ".agents-flow/agents/talos.agent.md"),
 * values are file contents as strings. Directories are inferred
 * from the file paths.
 */
function createMemoryFs(files: ReadonlyMap<string, string>): ScannerFs {
  const dirs = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  return {
    async readDir(path: string): Promise<readonly string[]> {
      // Collect direct children of the given directory
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const entries = new Set<string>();
      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      // Also check inferred directories
      for (const dirPath of dirs) {
        if (dirPath.startsWith(prefix)) {
          const rest = dirPath.slice(prefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      return Array.from(entries);
    },

    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    },

    async stat(path: string): Promise<{ type: "file" | "directory" } | undefined> {
      if (files.has(path)) return { type: "file" };
      if (dirs.has(path)) return { type: "directory" };
      return undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures — .agents-flow/ content
// ---------------------------------------------------------------------------

const TALOS_PLAN_AGENT = `---
agentId: talos-code-plan
name: Talos Code Plan
description: Planning agent that produces structured plans
output.kind: plan
adapterKind: pi-mono
model: deepseek-v4-flash
turnMode: plan
includes:
  instructions:
    - plan-format
  skills:
    - codebase-search
  globalSystemPrompt: true
---

You are a planning agent. Analyze the task and produce a structured plan.
`;

const TALOS_EXECUTE_AGENT = `---
agentId: talos-code-execute
name: Talos Code Execute
description: Execution agent that implements plans
output.kind: text
adapterKind: pi-mono
model: deepseek-v4-flash
turnMode: normal
userInvocable: true
argumentHint: Task description
includes:
  instructions: []
  skills: []
  globalSystemPrompt: true
---

You are an execution agent. Carry out the plan step by step.
`;

const TALOS_EVALUATE_AGENT = `---
agentId: talos-code-evaluate
name: Talos Code Evaluate
description: Evaluation agent that scores results
output.kind: score
adapterKind: pi-mono
model: deepseek-v4-flash
turnMode: evaluate
includes:
  instructions: []
  skills: []
  globalSystemPrompt: true
---

Evaluate the result and provide a score from 0 to 1.
`;

const GLOBAL_SYSTEM_PROMPT = `---
name: agentsflow-global
---

You are part of the AgentsFlow system. Follow these principles:
- Be precise and traceable
- Respect output.kind formatting rules
`;

const PLAN_FORMAT_INSTRUCTION = `---
name: plan-format
description: Defines the plan output format standard
applyTo: "*.plan.*"
---

# Plan Format Standard

## Template
1. **Objective**: State the goal
2. **Steps**: Ordered list of steps
3. **Dependencies**: Cross-step dependencies
4. **Risks**: Potential issues
`;

const CODEBASE_SEARCH_SKILL = `---
name: codebase-search
description: Strategies for searching and navigating codebases
argumentHint: Search query
---

# Codebase Search

## Strategies
- Semantic search for concept-based queries
- Grep for exact strings
- File glob for known filename patterns
`;

function createFullFixtureFs(): ScannerFs {
  const files = new Map<string, string>([
    [".agents-flow/global-system-prompt.md", GLOBAL_SYSTEM_PROMPT],
    [".agents-flow/agents/talos-code-plan.agent.md", TALOS_PLAN_AGENT],
    [".agents-flow/agents/talos-code-execute.agent.md", TALOS_EXECUTE_AGENT],
    [".agents-flow/agents/talos-code-evaluate.agent.md", TALOS_EVALUATE_AGENT],
    [".agents-flow/instructions/plan-format.instructions.md", PLAN_FORMAT_INSTRUCTION],
    [".agents-flow/skills/codebase-search/SKILL.md", CODEBASE_SEARCH_SKILL],
  ]);
  return createMemoryFs(files);
}

// ---------------------------------------------------------------------------
// Scanner tests
// ---------------------------------------------------------------------------

describe("scanAgentsFlowDir", () => {
  it("discovers all asset types in a complete .agents-flow directory", async () => {
    const fs = createFullFixtureFs();
    const result = await scanAgentsFlowDir(fs);

    expect(result.globalSystemPromptPath).toBe(".agents-flow/global-system-prompt.md");
    expect(result.agentPaths).toHaveLength(3);
    expect(result.agentPaths).toContain(".agents-flow/agents/talos-code-plan.agent.md");
    expect(result.agentPaths).toContain(".agents-flow/agents/talos-code-execute.agent.md");
    expect(result.agentPaths).toContain(".agents-flow/agents/talos-code-evaluate.agent.md");
    expect(result.instructionPaths).toHaveLength(1);
    expect(result.instructionPaths).toContain(".agents-flow/instructions/plan-format.instructions.md");
    expect(result.skillPaths).toHaveLength(1);
    expect(result.skillPaths).toContain(".agents-flow/skills/codebase-search/SKILL.md");
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty results when .agents-flow does not exist", async () => {
    const fs = createMemoryFs(new Map());
    const result = await scanAgentsFlowDir(fs);

    expect(result.globalSystemPromptPath).toBeUndefined();
    expect(result.agentPaths).toHaveLength(0);
    expect(result.instructionPaths).toHaveLength(0);
    expect(result.skillPaths).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports errors for non-.agent.md files in agents/", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/README.md", "# Not an agent file"],
    ]);
    const fs = createMemoryFs(files);
    const result = await scanAgentsFlowDir(fs);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("unexpected_file");
    expect(result.errors[0]?.path).toContain("README.md");
  });

  it("reports errors for non-.instructions.md files in instructions/", async () => {
    const files = new Map<string, string>([
      [".agents-flow/instructions/notes.md", "# Just notes"],
    ]);
    const fs = createMemoryFs(files);
    const result = await scanAgentsFlowDir(fs);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("unexpected_file");
  });
});

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe("parseAgentFile", () => {
  it("parses a valid .agent.md file", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/test.agent.md", TALOS_PLAN_AGENT],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseAgentFile(fs, ".agents-flow/agents/test.agent.md", errors);

    expect(errors).toHaveLength(0);
    expect(result).toBeDefined();
    expect(result!.agentId).toBe("talos-code-plan");
    expect(result!.name).toBe("Talos Code Plan");
    expect(result!.outputKind).toBe("plan");
    expect(result!.adapterKind).toBe("pi-mono");
    expect(result!.model).toBe("deepseek-v4-flash");
    expect(result!.turnMode).toBe("plan");
    expect(result!.includes.instructions).toContain("plan-format");
    expect(result!.includes.skills).toContain("codebase-search");
    expect(result!.includes.globalSystemPrompt).toBe(true);
    expect(result!.body.trim()).toContain("You are a planning agent");
  });

  it("reports error for missing frontmatter", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/bad.agent.md", "No frontmatter here"],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseAgentFile(fs, ".agents-flow/agents/bad.agent.md", errors);

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("invalid_frontmatter");
  });

  it("reports error for invalid YAML frontmatter", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/bad.agent.md", "---\ninvalid: [yaml: content\n---\nbody"],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseAgentFile(fs, ".agents-flow/agents/bad.agent.md", errors);

    expect(result).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("reports error for schema validation failure", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/bad.agent.md", "---\nname: Missing agentId\n---\nbody"],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseAgentFile(fs, ".agents-flow/agents/bad.agent.md", errors);

    expect(result).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("invalid_frontmatter");
  });
});

describe("parseInstructionFile", () => {
  it("parses a valid .instructions.md file", async () => {
    const files = new Map<string, string>([
      [".agents-flow/instructions/plan-format.instructions.md", PLAN_FORMAT_INSTRUCTION],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseInstructionFile(fs, ".agents-flow/instructions/plan-format.instructions.md", errors);

    expect(errors).toHaveLength(0);
    expect(result).toBeDefined();
    expect(result!.filename).toBe("plan-format.instructions.md");
    expect(result!.name).toBe("plan-format");
    expect(result!.applyTo).toBe("*.plan.*");
    expect(result!.content).toContain("Plan Format Standard");
  });
});

describe("parseSkillFile", () => {
  it("parses a valid SKILL.md file", async () => {
    const files = new Map<string, string>([
      [".agents-flow/skills/codebase-search/SKILL.md", CODEBASE_SEARCH_SKILL],
    ]);
    const fs = createMemoryFs(files);
    const errors: any[] = [];

    const result = await parseSkillFile(fs, ".agents-flow/skills/codebase-search/SKILL.md", errors);

    expect(errors).toHaveLength(0);
    expect(result).toBeDefined();
    expect(result!.folderName).toBe("codebase-search");
    expect(result!.name).toBe("codebase-search");
    expect(result!.argumentHint).toBe("Search query");
    expect(result!.content).toContain("Codebase Search");
  });
});

// ---------------------------------------------------------------------------
// Resolver tests
// ---------------------------------------------------------------------------

describe("resolvePromptAssetManifest", () => {
  it("resolves a complete .agents-flow directory", async () => {
    const fs = createFullFixtureFs();
    const manifest = await resolvePromptAssetManifest(fs);

    expect(manifest.errors).toHaveLength(0);
    expect(manifest.agents.size).toBe(3);
    expect(manifest.instructions.size).toBe(1);
    expect(manifest.skills.size).toBe(1);
    expect(manifest.globalSystemPrompt).toBeDefined();

    // Verify agents
    const planAgent = manifest.agents.get("talos-code-plan");
    expect(planAgent).toBeDefined();
    expect(planAgent!.agentId).toBe("talos-code-plan");
    expect(planAgent!.includes.instructions).toContain("plan-format");

    // Verify instructions (keyed by name, not filename)
    const planInstruction = manifest.instructions.get("plan-format");
    expect(planInstruction).toBeDefined();
    expect(planInstruction!.name).toBe("plan-format");

    // Verify skills
    const searchSkill = manifest.skills.get("codebase-search");
    expect(searchSkill).toBeDefined();
    expect(searchSkill!.name).toBe("codebase-search");
  });

  it("reports duplicate agentId errors", async () => {
    const files = new Map<string, string>([
      [".agents-flow/agents/dup1.agent.md", TALOS_PLAN_AGENT],
      [".agents-flow/agents/dup2.agent.md", TALOS_PLAN_AGENT], // same agentId
    ]);
    const fs = createMemoryFs(files);
    const manifest = await resolvePromptAssetManifest(fs);

    const dupErrors = manifest.errors.filter((e) => e.code === "duplicate_agent_id");
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it("reports missing include errors", async () => {
    // Agent references non-existent instruction
    const agentWithBadRef = `---
agentId: test-agent
name: Test Agent
description: Test
output.kind: text
adapterKind: pi-mono
includes:
  instructions:
    - nonexistent-instruction
  skills:
    - nonexistent-skill
  globalSystemPrompt: true
---

Body text
`;
    const files = new Map<string, string>([
      [".agents-flow/agents/test.agent.md", agentWithBadRef],
    ]);
    const fs = createMemoryFs(files);
    const manifest = await resolvePromptAssetManifest(fs);

    const includeErrors = manifest.errors.filter((e) => e.code === "missing_include");
    expect(includeErrors.length).toBe(2); // one for instruction, one for skill
  });

  it("returns empty manifest when .agents-flow does not exist", async () => {
    const fs = createMemoryFs(new Map());
    const manifest = await resolvePromptAssetManifest(fs);

    expect(manifest.agents.size).toBe(0);
    expect(manifest.instructions.size).toBe(0);
    expect(manifest.skills.size).toBe(0);
    expect(manifest.globalSystemPrompt).toBeUndefined();
    expect(manifest.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Prompt assembler tests
// ---------------------------------------------------------------------------

describe("assemblePromptPackage", () => {
  function createTestManifest(): PromptAssetManifest {
    const planAgent: ResolvedAgentAsset = {
      agentId: "talos-code-plan",
      name: "Talos Code Plan",
      description: "Planning agent",
      outputKind: "plan",
      adapterKind: "pi-mono",
      model: "deepseek-v4-flash",
      turnMode: "plan",      tools: ["search", "read"],
      userInvocable: false,      includes: {
        instructions: ["plan-format"],
        skills: ["codebase-search"],
        globalSystemPrompt: true,
      },
      body: "You are a planning agent.",
      sourcePath: ".agents-flow/agents/talos-code-plan.agent.md",
    };

    const instruction: ResolvedInstructionAsset = {
      filename: "plan-format.instructions.md",
      name: "plan-format",
      description: "Plan format standard",
      applyTo: "*.plan.*",
      content: "# Plan Format Standard\n\nUse structured plans.",
      sourcePath: ".agents-flow/instructions/plan-format.instructions.md",
    };

    const skill: ResolvedSkillAsset = {
      folderName: "codebase-search",
      name: "codebase-search",
      description: "Codebase search skill",
      argumentHint: "Search query",
      content: "# Codebase Search\n\nUse semantic and grep search.",
      sourcePath: ".agents-flow/skills/codebase-search/SKILL.md",
    };

    return {
      globalSystemPrompt: "You are part of AgentsFlow.",
      agents: new Map([["talos-code-plan", planAgent]]),
      instructions: new Map([["plan-format", instruction]]),
      skills: new Map([["codebase-search", skill]]),
      errors: [],
    };
  }

  it("assembles all 6 layers in correct order", () => {
    const manifest = createTestManifest();
    const agent = manifest.agents.get("talos-code-plan")!;

    const result = assemblePromptPackage(
      agent,
      manifest,
      { systemPrompt: "Node system override", userPrompt: "Node user override" },
      { userPrompt: "Run input prompt", data: "Run input data" },
    );

    // Verify segments are in correct order
    // global + instruction + skill + body + sysOverride + userOverride + runPrompt + runData = 8
    // But node-config systemPrompt and userPrompt are separate segments
    expect(result.segments.length).toBeGreaterThanOrEqual(7);
    expect(result.segments.map((s) => s.scope)).toEqual([
      "global-system-prompt",
      "instruction",
      "skill",
      "agent-body",
      "node-config",
      "node-config",
      "run-input",
      "run-input",
    ]);
  });

  it("omits global system prompt when agent includes.globalSystemPrompt is false", () => {
    const manifest = createTestManifest();
    const agent = manifest.agents.get("talos-code-plan")!;
    agent.includes.globalSystemPrompt = false;

    const result = assemblePromptPackage(agent, manifest);

    const globalSegments = result.segments.filter((s) => s.scope === "global-system-prompt");
    expect(globalSegments).toHaveLength(0);
  });

  it("produces plan expectedOutput for output.kind=plan", () => {
    const manifest = createTestManifest();
    const agent = manifest.agents.get("talos-code-plan")!;

    const result = assemblePromptPackage(agent, manifest);

    expect(result.expectedOutput).toEqual({ schemaRef: "plan" });
    expect(result.outputKind).toBe("plan");
    expect(result.turnMode).toBe("plan");
  });

  it("deduplicates instructions and skills", () => {
    const manifest = createTestManifest();
    const agent = manifest.agents.get("talos-code-plan")!;
    // Duplicate references
    agent.includes.instructions = ["plan-format", "plan-format"];
    agent.includes.skills = ["codebase-search", "codebase-search"];

    const result = assemblePromptPackage(agent, manifest);

    const instructionSegments = result.segments.filter((s) => s.scope === "instruction");
    const skillSegments = result.segments.filter((s) => s.scope === "skill");
    expect(instructionSegments).toHaveLength(1);
    expect(skillSegments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// BuiltInProviderAdapter tests
// ---------------------------------------------------------------------------

describe("BuiltInProviderAdapter", () => {
  function createTestManifest(): PromptAssetManifest {
    const agent: ResolvedAgentAsset = {
      agentId: "test-agent",
      name: "Test Agent",
      description: "Test description",
      outputKind: "text",
      adapterKind: "pi-mono",
      tools: [],
      userInvocable: true,
      includes: {
        instructions: [],
        skills: [],
        globalSystemPrompt: false,
      },
      body: "You are a test agent.",
      sourcePath: ".agents-flow/agents/test.agent.md",
    };

    return {
      globalSystemPrompt: undefined,
      agents: new Map([["test-agent", agent]]),
      instructions: new Map(),
      skills: new Map(),
      errors: [],
    };
  }

  it("packagePrompt returns ProviderPromptPackage for known agentId", () => {
    const manifest = createTestManifest();
    const adapter = new BuiltInProviderAdapter();

    const result = adapter.packagePrompt("test-agent", manifest);

    expect(result).toBeDefined();
    expect(result!.prompt).toContain("You are a test agent.");
  });

  it("packagePrompt returns undefined for unknown agentId", () => {
    const manifest = createTestManifest();
    const adapter = new BuiltInProviderAdapter();

    const result = adapter.packagePrompt("unknown-agent", manifest);

    expect(result).toBeUndefined();
  });

  it("isResolvable returns true for error-free agents", () => {
    const manifest = createTestManifest();
    const adapter = new BuiltInProviderAdapter();

    expect(adapter.isResolvable("test-agent", manifest)).toBe(true);
  });

  it("isResolvable returns false for unknown agents", () => {
    const manifest = createTestManifest();
    const adapter = new BuiltInProviderAdapter();

    expect(adapter.isResolvable("unknown", manifest)).toBe(false);
  });

  it("isResolvable returns false for agents with errors", () => {
    const manifest = createTestManifest();
    // Add an error associated with the agent
    manifest.errors.push({
      code: "missing_include",
      message: "Missing instruction",
      sourcePath: ".agents-flow/agents/test.agent.md",
      agentId: "test-agent",
    });
    const adapter = new BuiltInProviderAdapter();

    expect(adapter.isResolvable("test-agent", manifest)).toBe(false);
  });

  it("getDropdownItems returns metadata for all agents", () => {
    const manifest = createTestManifest();
    const adapter = new BuiltInProviderAdapter();

    const items = adapter.getDropdownItems(manifest);

    expect(items).toHaveLength(1);
    expect(items[0]!.agentId).toBe("test-agent");
    expect(items[0]!.name).toBe("Test Agent");
    expect(items[0]!.hasErrors).toBe(false);
  });

  it("singleton builtInAdapter has adapterId 'built-in'", () => {
    expect(builtInAdapter.adapterId).toBe("built-in");
  });
});

// ---------------------------------------------------------------------------
// ProviderAdapterRegistry tests
// ---------------------------------------------------------------------------

describe("ProviderAdapterRegistry", () => {
  it("has built-in adapter registered by default", () => {
    const registry = new ProviderAdapterRegistry();

    expect(registry.has("built-in")).toBe(true);
    expect(registry.get("built-in")).toBe(builtInAdapter);
  });

  it("registers and retrieves custom adapters", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter = {
      adapterId: "custom",
      packagePrompt: () => undefined,
      isResolvable: () => false,
      getDropdownItems: () => [],
    };

    registry.register(customAdapter);

    expect(registry.has("custom")).toBe(true);
    expect(registry.get("custom")).toBe(customAdapter);
  });

  it("throws on duplicate adapter registration", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter = {
      adapterId: "custom",
      packagePrompt: () => undefined,
      isResolvable: () => false,
      getDropdownItems: () => [],
    };

    registry.register(customAdapter);

    expect(() => registry.register(customAdapter)).toThrow(/already registered/);
  });

  it("unregisters custom adapters", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter = {
      adapterId: "custom",
      packagePrompt: () => undefined,
      isResolvable: () => false,
      getDropdownItems: () => [],
    };

    registry.register(customAdapter);
    registry.unregister("custom");

    expect(registry.has("custom")).toBe(false);
  });

  it("prevents unregistering the built-in adapter", () => {
    const registry = new ProviderAdapterRegistry();

    expect(() => registry.unregister("built-in")).toThrow(/Cannot unregister/);
  });

  it("resolves to matching adapter or falls back to built-in", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter = {
      adapterId: "custom",
      packagePrompt: () => undefined,
      isResolvable: () => false,
      getDropdownItems: () => [],
    };

    registry.register(customAdapter);

    expect(registry.resolve("custom")).toBe(customAdapter);
    expect(registry.resolve("unknown")).toBe(builtInAdapter);
  });

  it("listAdapterIds returns all registered adapter IDs", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter = {
      adapterId: "custom",
      packagePrompt: () => undefined,
      isResolvable: () => false,
      getDropdownItems: () => [],
    };

    registry.register(customAdapter);
    const ids = registry.listAdapterIds();

    expect(ids).toContain("built-in");
    expect(ids).toContain("custom");
  });

  it("packagePrompt delegates to the resolved adapter", () => {
    const registry = new ProviderAdapterRegistry();
    const manifest: PromptAssetManifest = {
      globalSystemPrompt: undefined,
      agents: new Map(),
      instructions: new Map(),
      skills: new Map(),
      errors: [],
    };

    // Built-in adapter will return undefined for empty manifest
    const result = registry.packagePrompt("built-in", "nonexistent", manifest);
    expect(result).toBeUndefined();
  });
});
