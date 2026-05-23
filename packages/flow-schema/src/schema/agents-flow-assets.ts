import { z } from "zod";

// ---------------------------------------------------------------------------
// .agents-flow frontmatter schemas
// ---------------------------------------------------------------------------

/**
 * Frontmatter schema for `.agents-flow/agents/*.agent.md` files.
 *
 * The YAML block between `---` delimiters must conform to this schema.
 * The markdown body after the closing `---` is the agent's system prompt.
 */
export const AgentFileFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  agentId: z.string().min(1),
  "output.kind": z.enum(["text", "plan", "score"]),
  adapterKind: z.string().min(1).default("pi-mono"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  turnMode: z.enum(["normal", "plan", "evaluate", "summarize"]).default("normal"),
  tools: z.array(z.string()).default([]),
  userInvocable: z.boolean().default(false),
  argumentHint: z.string().optional(),
  includes: z
    .object({
      instructions: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([]),
      globalSystemPrompt: z.boolean().default(true),
    })
    .default({ instructions: [], skills: [], globalSystemPrompt: true }),
});

export type AgentFileFrontmatter = z.infer<typeof AgentFileFrontmatterSchema>;

/**
 * Frontmatter schema for `.agents-flow/instructions/*.instructions.md` files.
 */
export const InstructionFileFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  applyTo: z.string().optional(),
});

export type InstructionFileFrontmatter = z.infer<
  typeof InstructionFileFrontmatterSchema
>;

/**
 * Frontmatter schema for `.agents-flow/skills/<name>/SKILL.md` files.
 */
export const SkillFileFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  argumentHint: z.string().optional(),
});

export type SkillFileFrontmatter = z.infer<typeof SkillFileFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Resolved asset types (normalized internal model)
// ---------------------------------------------------------------------------

/**
 * A fully parsed and validated agent asset from `.agents-flow/agents/*.agent.md`.
 */
export const ResolvedAgentAssetSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  outputKind: z.enum(["text", "plan", "score"]),
  adapterKind: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  turnMode: z.enum(["normal", "plan", "evaluate", "summarize"]).optional(),
  tools: z.array(z.string()),
  userInvocable: z.boolean(),
  argumentHint: z.string().optional(),
  includes: z.object({
    instructions: z.array(z.string()),
    skills: z.array(z.string()),
    globalSystemPrompt: z.boolean(),
  }),
  body: z.string(),
  sourcePath: z.string().min(1),
});

export type ResolvedAgentAsset = z.infer<typeof ResolvedAgentAssetSchema>;

/**
 * A fully parsed and validated instruction asset from `.agents-flow/instructions/*.instructions.md`.
 */
export const ResolvedInstructionAssetSchema = z.object({
  filename: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  applyTo: z.string().optional(),
  content: z.string(),
  sourcePath: z.string().min(1),
});

export type ResolvedInstructionAsset = z.infer<
  typeof ResolvedInstructionAssetSchema
>;

/**
 * A fully parsed and validated skill asset from `.agents-flow/skills/<name>/SKILL.md`.
 */
export const ResolvedSkillAssetSchema = z.object({
  folderName: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  argumentHint: z.string().optional(),
  content: z.string(),
  sourcePath: z.string().min(1),
});

export type ResolvedSkillAsset = z.infer<typeof ResolvedSkillAssetSchema>;

// ---------------------------------------------------------------------------
// Manifest errors
// ---------------------------------------------------------------------------

/**
 * Error codes produced during `.agents-flow/` scanning and parsing.
 */
export const ManifestErrorCodeSchema = z.enum([
  "duplicate_agent_id",
  "missing_include",
  "invalid_frontmatter",
  "file_read_error",
  "unexpected_file",
  "stat_error",
]);

export type ManifestErrorCode = z.infer<typeof ManifestErrorCodeSchema>;

/**
 * A single error encountered while building a PromptAssetManifest.
 */
export const ManifestErrorSchema = z.object({
  code: ManifestErrorCodeSchema,
  message: z.string().min(1),
  sourcePath: z.string().optional(),
  agentId: z.string().optional(),
});

export type ManifestError = z.infer<typeof ManifestErrorSchema>;

// ---------------------------------------------------------------------------
// Prompt segment (source attribution)
// ---------------------------------------------------------------------------

/**
 * A single assembled prompt segment with source attribution for inspector rendering.
 */
export const PromptSegmentSchema = z.object({
  scope: z.enum([
    "global-system-prompt",
    "instruction",
    "skill",
    "agent-body",
    "node-config",
    "run-input",
  ]),
  label: z.string().min(1),
  sourcePath: z.string().min(1),
  content: z.string(),
});

export type PromptSegment = z.infer<typeof PromptSegmentSchema>;

// ---------------------------------------------------------------------------
// PromptAssetManifest
// ---------------------------------------------------------------------------

/**
 * The complete set of resolved prompt assets from `.agents-flow/`.
 *
 * This is the authoritative internal representation. Raw markdown files are
 * parsed into this structure once and consumed by the runtime and UI.
 */
export const PromptAssetManifestSchema = z.object({
  globalSystemPrompt: z.string().optional(),
  agents: z.map(z.string(), ResolvedAgentAssetSchema),
  instructions: z.map(z.string(), ResolvedInstructionAssetSchema),
  skills: z.map(z.string(), ResolvedSkillAssetSchema),
  errors: z.array(ManifestErrorSchema),
});

export type PromptAssetManifest = z.infer<typeof PromptAssetManifestSchema>;

// ---------------------------------------------------------------------------
// ProviderPromptPackage (runtime-consumable)
// ---------------------------------------------------------------------------

/**
 * The output of prompt assembly, consumed by the flow engine at execution time.
 *
 * `prompt` is the assembled string. `segments` carries source attribution
 * for the inspector. `outputKind` and `turnMode` drive port publishing and
 * prompt selection. `expectedOutput` maps outputKind to the existing
 * AgentInvocation.expectedOutput contract.
 */
export const ProviderPromptPackageSchema = z.object({
  prompt: z.string(),
  expectedOutput: z
    .object({
      schemaRef: z.string().optional(),
      schema: z.record(z.unknown()).optional(),
    })
    .optional(),
  turnMode: z.enum(["normal", "plan", "evaluate", "summarize"]),
  outputKind: z.enum(["text", "plan", "score"]),
  segments: z.array(PromptSegmentSchema),
});

export type ProviderPromptPackage = z.infer<typeof ProviderPromptPackageSchema>;

// ---------------------------------------------------------------------------
// ProviderAdapter — abstraction for prompt packaging strategies
// ---------------------------------------------------------------------------

/**
 * Configuration overrides that a node can apply to the prompt assembly.
 */
export interface NodeConfigOverrides {
  readonly systemPrompt?: string;
  readonly userPrompt?: string;
}

/**
 * Run-level input data available during prompt assembly.
 */
export interface RunInputData {
  readonly userPrompt?: string;
  readonly data?: string;
}

/**
 * ProviderAdapter — an abstraction over prompt packaging strategies.
 *
 * The built-in adapter uses AgentsFlow's own 6-layer prompt assembly.
 * Future adapters (Copilot, Claude, etc.) will implement this interface
 * to produce provider-specific output shapes while accepting the same
 * normalized manifest input.
 */
export interface ProviderAdapter {
  /** Unique identifier for this adapter (e.g. "built-in", "copilot", "claude"). */
  readonly adapterId: string;

  /**
   * Build a `ProviderPromptPackage` for the given agent.
   *
   * @param agentId - The `agentId` from a `.agent.md` file
   * @param manifest - The resolved prompt asset manifest
   * @param nodeConfigOverrides - Optional node-level prompt overrides
   * @param runInput - Optional run-level input data
   * @returns A `ProviderPromptPackage` ready for the flow engine, or
   *          `undefined` if the agentId is not found in the manifest.
   */
  packagePrompt(
    agentId: string,
    manifest: PromptAssetManifest,
    nodeConfigOverrides?: NodeConfigOverrides,
    runInput?: RunInputData,
  ): ProviderPromptPackage | undefined;

  /**
   * Check if an agentId can be resolved by this adapter.
   */
  isResolvable(agentId: string, manifest: PromptAssetManifest): boolean;

  /**
   * Get agent metadata for UI display (dropdown items).
   */
  getDropdownItems(
    manifest: PromptAssetManifest,
  ): readonly {
    readonly agentId: string;
    readonly name: string;
    readonly description: string;
    readonly outputKind: string;
    readonly sourcePath: string;
    readonly hasErrors: boolean;
  }[];
}
