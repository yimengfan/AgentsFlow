# .agents-flow Repository Specification

## Status

Active

## Purpose

This document defines the `.agents-flow/` directory convention and the prompt asset model that enables external agent definitions, instruction fragments, and skills to be referenced by flow nodes.

Use it when you need to understand or change:

- how `.agents-flow/` directory structure is organized
- how `*.agent.md` frontmatter is parsed and validated
- how prompt assembly order is determined
- how source attribution is tracked for inspector rendering
- how `node.agentRef` binds a flow node to an external agent definition

Read it together with:

- `docs/specs/001-flow-node-contract.md` for the node spec and port contract
- `docs/specs/002-runtime-binding.md` for the executable binding path
- `packages/flow-schema/src/schema/agents-flow-assets.ts` for the Zod schemas
- `packages/flow-schema/src/schema/flow-definition.ts` for `agentRef` and `outputKind`

## Scope

This spec defines the repository-local prompt asset layer for MVP. It intentionally excludes vendor-native execution, arbitrary JSON schema branching, and Copilot/Claude adapter implementations (architecture is ready but not wired).

## Directory Tree

```
.agents-flow/
  global-system-prompt.md          # repo-wide baseline prompt (no frontmatter)
  agents/
    *.agent.md                     # executable agent definitions
  instructions/
    *.instructions.md              # reusable instruction fragments
  skills/
    <name>/SKILL.md                # skill folders (prompt-only in MVP)
```

### global-system-prompt.md

- **Location**: `.agents-flow/global-system-prompt.md`
- **Frontmatter**: None. Entire file content is the baseline prompt.
- **Purpose**: Prepended to every agent prompt unless the agent explicitly disables it via `includes.globalSystemPrompt: false`.
- **Cardinality**: At most one file. If absent, the global system prompt layer is empty.

### .agent.md

- **Location**: `.agents-flow/agents/*.agent.md`
- **Frontmatter**: YAML between `---` delimiters (see schema below)
- **Body**: Markdown after the closing `---` delimiter. This is the agent's system prompt / body content.
- **Cardinality**: Multiple. Each must have a unique `agentId`.

### .instructions.md

- **Location**: `.agents-flow/instructions/*.instructions.md`
- **Frontmatter**: YAML between `---` delimiters (see schema below)
- **Body**: Markdown after the closing `---` delimiter. This is the instruction content injected into prompts that reference it.
- **Cardinality**: Multiple. Filenames must be unique within the `instructions/` directory.

### SKILL.md

- **Location**: `.agents-flow/skills/<name>/SKILL.md`
- **Frontmatter**: YAML between `---` delimiters (see schema below)
- **Body**: Markdown after the closing `---` delimiter. This is the skill's prompt content.
- **Cardinality**: Multiple. Folder names must be unique within the `skills/` directory.

## Frontmatter Schemas

### .agent.md frontmatter

```yaml
---
name: string              # required — display name
description: string       # required — short description
agentId: string           # required — stable machine ID, must be unique across all .agent.md files
output.kind: text|plan|score  # required — built-in output kind (MVP only)
adapterKind: string       # optional, default "pi-mono" — default adapter kind
model: string             # optional — model identifier (e.g. "deepseek-v4-flash")
temperature: number       # optional — generation temperature (0-2)
turnMode: normal|plan|evaluate|summarize  # optional, default "normal"
tools: string[]           # optional — tool capability names
userInvocable: boolean    # optional, default false
argumentHint: string      # optional — hint for user invocation
includes:
  instructions: string[]  # optional — filenames from .agents-flow/instructions/
  skills: string[]        # optional — folder names from .agents-flow/skills/
  globalSystemPrompt: boolean  # optional, default true — whether to prepend global-system-prompt.md
---
```

Rules:

- `agentId` must be unique across all `.agent.md` files in the repository.
- `output.kind` is required and must be one of `text`, `plan`, or `score` (MVP constraint).
- `output.kind` determines which output port the runtime publishes to:
  - `text` → "result" and "out" ports (default agent behavior)
  - `plan` → "plan" port (in addition to "result" and "out")
  - `score` → "score" port (in addition to "result" and "out")
- `includes.instructions` references instruction **names** (the `name` field from frontmatter, e.g. `"plan-format"`), not filenames.
- `includes.skills` references folder names (not paths) from the `skills/` directory.
- If `includes` is absent, defaults to `{ globalSystemPrompt: true, instructions: [], skills: [] }`.

### .instructions.md frontmatter

```yaml
---
name: string              # required — display name
description: string       # required — short description
applyTo: string           # optional — glob pattern for auto-attachment (MVP: not wired)
---
```

Rules:

- `applyTo` is parsed but not wired to automatic attachment in MVP.
- Instruction content is injected only when explicitly referenced via `includes.instructions`.

### SKILL.md frontmatter

```yaml
---
name: string              # required — display name
description: string       # required — short description
argumentHint: string      # optional — hint for skill invocation
---
```

Rules:

- Skill prompt content is injected only when explicitly referenced via `includes.skills`.
- Skill script execution is excluded from MVP.

## Prompt Assembly Order

When a flow node references an agent via `node.agentRef`, the prompt is assembled from the following layers in this exact order:

1. **global-system-prompt.md** — if `includes.globalSystemPrompt !== false`
2. **Referenced `.instructions.md` files** — in `includes.instructions` order
3. **Referenced SKILL.md bodies** — in `includes.skills` order
4. **`.agent.md` body** — markdown after frontmatter
5. **Node-level config overrides** — `systemPrompt`, `userPrompt` from `node.config`
6. **Run input / upstream data** — `userPrompt`, `data`, `previousResult`

### Deduplication

Each instruction and skill is included only at its first occurrence in the assembly order. If the same instruction or skill is referenced by multiple agents in a multi-node flow, it appears only once per agent prompt assembly (not globally across the entire run).

### Source Attribution

Each assembled prompt segment carries attribution metadata for inspector rendering:

```ts
interface PromptSegment {
  readonly scope: "global-system-prompt" | "instruction" | "skill" | "agent-body" | "node-config" | "run-input";
  readonly label: string;
  readonly sourcePath: string;   // relative path within .agents-flow/
  readonly content: string;
}
```

The inspector renders these segments in order, showing scope, label, and source path. This enables debugging which layer contributed which part of the final prompt.

## Node Binding Model

### agentRef on NodeDef

```ts
// In flow-definition.ts
NodeDefSchema = z.object({
  // ... existing fields ...
  agentRef: z.string().optional(),  // reference to .agent.md agentId
});
```

Rules:

- `agentRef` takes precedence over `agentId` when both are present on a node.
- When `agentRef` is present, the runtime resolves the agent definition from the `PromptAssetManifest` instead of from `agents.agentDefs`.
- When `agentRef` is absent, the node falls through to the existing `agentId → agents.agentDefs` binding path. This preserves backward compatibility.
- `agentRef` values must match an `agentId` from a `.agent.md` file in the resolved `PromptAssetManifest`.

### outputKind on AgentDef

```ts
// In flow-definition.ts
AgentDefSchema = z.object({
  // ... existing fields ...
  outputKind: z.enum(["text", "plan", "score"]).optional(),
});
```

Rules:

- `outputKind` declares the built-in output kind for an agent definition.
- When `outputKind` is present on the resolved agent (from `.agent.md` or inline `agentDef`), it determines which output port the runtime publishes to.
- When `outputKind` is absent, the runtime uses the existing `turnMode`-based port mapping (backward compatibility).

### Port Publishing by outputKind

| outputKind | Published Ports (in addition to "out" and "result") |
|------------|------------------------------------------------------|
| `text`     | None (default behavior)                              |
| `plan`     | "plan" port                                          |
| `score`    | "score" port                                         |

This replaces the existing hardcoded `turnMode → port` mapping in `FlowScheduler.executeAgentNode()` when `outputKind` is present.

### presetAgentRef on NodeSpec

```ts
// In base.ts
interface NodeSpec {
  // ... existing fields ...
  readonly presetAgentRef?: string;  // hint for UI pre-population
}
```

Rules:

- `presetAgentRef` is a UI hint only. When a node is created from a spec with `presetAgentRef`, the inspector may pre-populate the agent binding dropdown.
- It does not affect runtime execution.
- Built-in values: `agent.main` → `"main-agent"`, `agent.sub` → `"sub-agent"`.

## Normalized Internal Model

The internal prompt asset model is the authoritative representation, NOT the raw markdown files.

### PromptAssetManifest

```ts
interface PromptAssetManifest {
  readonly globalSystemPrompt: string | undefined;
  readonly agents: ReadonlyMap<string, ResolvedAgentAsset>;        // keyed by agentId
  readonly instructions: ReadonlyMap<string, ResolvedInstructionAsset>;  // keyed by name
  readonly skills: ReadonlyMap<string, ResolvedSkillAsset>;        // keyed by folderName
  readonly errors: readonly ManifestError[];
}
```

Key conventions:
- `agents` map is keyed by `agentId` (e.g. `"talos-code-plan"`)
- `instructions` map is keyed by the instruction's `name` field (e.g. `"plan-format"`), NOT by filename
- `skills` map is keyed by `folderName` (e.g. `"codebase-search"`)
- Duplicate instruction names within a manifest produce a `duplicate_instruction_name` error

### Resolved types

```ts
interface ResolvedAgentAsset {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly outputKind: "text" | "plan" | "score";
  readonly adapterKind: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly turnMode?: "normal" | "plan" | "evaluate" | "summarize";
  readonly tools: readonly string[];
  readonly userInvocable: boolean;
  readonly argumentHint?: string;
  readonly includes: {
    readonly instructions: readonly string[];
    readonly skills: readonly string[];
    readonly globalSystemPrompt: boolean;
  };
  readonly body: string;
  readonly sourcePath: string;
}

interface ResolvedInstructionAsset {
  readonly filename: string;
  readonly name: string;
  readonly description: string;
  readonly applyTo?: string;
  readonly content: string;
  readonly sourcePath: string;
}

interface ResolvedSkillAsset {
  readonly folderName: string;
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly content: string;
  readonly sourcePath: string;
}
```

### Manifest Errors

```ts
interface ManifestError {
  readonly code: "duplicate_agent_id" | "duplicate_instruction_name" | "missing_include" | "invalid_frontmatter" | "file_read_error";
  readonly message: string;
  readonly sourcePath?: string;
  readonly agentId?: string;
}
```

The resolver collects errors during scanning and parsing. The UI displays these errors in the agent binding dropdown and validation panel. The runtime must refuse to execute a node whose `agentRef` has associated manifest errors.

## Provider Packaging Boundary

The `ProviderPromptPackage` is the runtime-consumable output of the prompt asset resolver:

```ts
interface ProviderPromptPackage {
  readonly prompt: string;                  // assembled prompt string
  readonly expectedOutput?: {               // mapped from outputKind
    readonly schemaRef?: string;
    readonly schema?: Record<string, unknown>;
  };
  readonly turnMode: "normal" | "plan" | "evaluate" | "summarize";
  readonly outputKind: "text" | "plan" | "score";
  readonly segments: readonly PromptSegment[];  // source attribution for inspector
}
```

### outputKind → expectedOutput mapping

| outputKind | expectedOutput                                          |
|------------|---------------------------------------------------------|
| `plan`     | `{ schemaRef: "plan" }`                                 |
| `score`    | `{ schemaRef: "score", schema: { type: "object", properties: { score: { type: "number" }, canComplete: { type: "boolean" }, reason: { type: "string" } } } }` |
| `text`     | `undefined`                                             |

### Provider adapter future

The `packageForBuiltInMode()` function produces a `ProviderPromptPackage` from a resolved agent asset. In the future, `packageForCopilotMode()` and `packageForClaudeMode()` will accept the same normalized input but produce provider-specific output shapes. The internal model is authoritative; Copilot/Claude files are adapter targets, not constraints.

## ProviderAdapter Pattern

The `ProviderAdapter` interface abstracts provider-specific prompt packaging behind a common contract. This enables the built-in prompt assembly mode to coexist with future Copilot, Claude, and other provider adapters without modifying core packages.

### ProviderAdapter Interface

```ts
interface ProviderAdapter {
  readonly adapterId: string;
  packagePrompt(agentId: string, manifest: PromptAssetManifest, nodeConfig?: NodeConfigOverrides, runInput?: RunInputData): ProviderPromptPackage | undefined;
  isResolvable(agentId: string, manifest: PromptAssetManifest): boolean;
  getDropdownItems(manifest: PromptAssetManifest): ReadonlyArray<AgentDropdownItem>;
}
```

- `adapterId`: Unique identifier for the adapter (e.g. `"built-in"`, `"copilot"`, `"claude"`).
- `packagePrompt()`: Assembles a `ProviderPromptPackage` for the given agent. Returns `undefined` if the agent cannot be resolved.
- `isResolvable()`: Checks whether the agent can be packaged (no errors, exists in manifest).
- `getDropdownItems()`: Returns metadata for all agents in the manifest, suitable for UI dropdown rendering.

### BuiltInProviderAdapter

The `BuiltInProviderAdapter` (adapterId: `"built-in"`) implements the 6-layer prompt assembly defined in this spec. It is the default adapter and is always available.

Key behaviors:
- Assembles prompt segments in the defined order: global-system-prompt → instructions → skills → agent-body → node-config → run-input
- Deduplicates instructions and skills by reference key
- Maps `outputKind` to `expectedOutput` per the table above
- Returns `undefined` from `packagePrompt()` when the agent is not found or has associated manifest errors

### ProviderAdapterRegistry

The `ProviderAdapterRegistry` manages adapter instances globally:

```ts
class ProviderAdapterRegistry {
  register(adapter: ProviderAdapter): void;        // throws on duplicate adapterId
  unregister(adapterId: string): void;             // throws for "built-in"
  has(adapterId: string): boolean;
  get(adapterId: string): ProviderAdapter | undefined;
  resolve(adapterKind: string): ProviderAdapter;   // falls back to built-in
  listAdapterIds(): string[];
  packagePrompt(adapterKind: string, agentId: string, manifest: PromptAssetManifest, ...): ProviderPromptPackage | undefined;
}
```

Rules:
- The built-in adapter is pre-registered and cannot be unregistered.
- `resolve()` returns the adapter matching `adapterKind`, or falls back to the built-in adapter.
- Custom adapters (Copilot, Claude, etc.) are registered at application startup.
- Runtime adapter registration is global state; tests must clean up custom registrations in afterEach/afterAll.

### AgentDropdownItem

```ts
interface AgentDropdownItem {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly adapterKind: string;
  readonly outputKind: "text" | "plan" | "score";
  readonly hasErrors: boolean;
}
```

Used by the node inspector to render the agent binding dropdown. Agents with `hasErrors: true` are displayed with a warning indicator and cannot be selected for execution.

## ScannerFs (Platform-Agnostic Filesystem)

The scanner uses a platform-agnostic filesystem interface to enable both Node.js and browser environments:

```ts
interface ScannerFs {
  readDir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean }>;
}
```

- In Node.js: implemented using `fs.promises` (`readdir`, `readFile`, `stat`).
- In browser: implemented using in-memory virtual filesystem or HTTP fetch.
- Tests use an in-memory `Map`-based implementation (`createMemoryFs()`).

This abstraction ensures the scanner can run in both the desktop app (Node.js) and the web app (browser) without code duplication.

## Extended Binding Path

With `.agents-flow`, the binding path extends as follows:

```mermaid
flowchart LR
  Node[graph.nodes[*]] --> AgentRef{node.agentRef?}
  AgentRef -->|present| Manifest[PromptAssetManifest]
  Manifest --> ResolvedAgent[ResolvedAgentAsset]
  ResolvedAgent --> AdapterKind[agent.adapterKind]
  AdapterKind --> Registry[runtime-adapter-registry]
  Registry --> Adapter[AgentAdapter instance]
  Adapter --> Transport[provider transport]
  AgentRef -->|absent| AgentId[node.agentId]
  AgentId --> AgentDef[agents.agentDefs[*]]
  AgentDef --> AdapterKind2[agentDef.adapterKind]
  AdapterKind2 --> Registry2[runtime-adapter-registry]
  Registry2 --> Adapter2[AgentAdapter instance]
  Adapter2 --> Transport2[provider transport]
```

Rules:

- When `node.agentRef` is present, resolution goes through the `PromptAssetManifest`.
- When `node.agentRef` is absent, resolution falls through to the existing `agentId → agentDefs` path.
- Both paths converge at `adapterKind → runtime adapter extension → transport`.

## MVP Includes / Excludes

### Includes

- Scanning `.agents-flow/` directory recursively (via platform-agnostic `ScannerFs`)
- Parsing frontmatter from all asset types
- Building `PromptAssetManifest` with error collection (including duplicate agentId and duplicate instruction name detection)
- Prompt assembly in the defined 6-layer order via `BuiltInProviderAdapter`
- Source attribution tracking via `PromptSegment[]`
- `ProviderAdapter` interface and `ProviderAdapterRegistry` for multi-provider support
- Agent binding dropdown metadata via `getDropdownItems()`
- `node.agentRef` → manifest resolution in runtime
- `outputKind` → port publishing in runtime
- Backward compatibility for flows without `agentRef`
- Validation of `agentRef` existence and `outputKind` port compatibility

### Excludes

- Arbitrary JSON schema branching for output ports
- Copilot/Claude adapter implementations (ProviderAdapter interface is ready, concrete adapters not yet wired)
- Skill script execution (prompt-only)
- Auto-attachment via `applyTo` glob patterns
- Hooks and handoffs (Copilot-style `hooks`, `handoffs` fields)
- Dynamic agent creation from skill folders
- Multi-provider concurrent execution