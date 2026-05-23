import { parse as parseYaml } from "yaml";
import {
  AgentFileFrontmatterSchema,
  InstructionFileFrontmatterSchema,
  SkillFileFrontmatterSchema,
  type AgentFileFrontmatter,
  type InstructionFileFrontmatter,
  type SkillFileFrontmatter,
  type ResolvedAgentAsset,
  type ResolvedInstructionAsset,
  type ResolvedSkillAsset,
  type ManifestError,
} from "@agentsflow/flow-schema";
import type { ScannerFs } from "./types.js";

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter and body from a markdown string.
 * Returns `{ frontmatter: string | undefined, body: string }`.
 */
function splitFrontmatter(
  content: string,
): { readonly frontmatter: string | undefined; readonly body: string } {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match || !match[1]) {
    return { frontmatter: undefined, body: content };
  }
  return { frontmatter: match[1], body: match[2] ?? "" };
}

// ---------------------------------------------------------------------------
// Agent file parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single `.agent.md` file into a `ResolvedAgentAsset`.
 */
export async function parseAgentFile(
  fs: ScannerFs,
  filePath: string,
  errors: ManifestError[],
): Promise<ResolvedAgentAsset | undefined> {
  let content: string;
  try {
    content = await fs.readFile(filePath);
  } catch (err) {
    errors.push({
      code: "file_read_error",
      message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const { frontmatter, body } = splitFrontmatter(content);
  if (!frontmatter) {
    errors.push({
      code: "invalid_frontmatter",
      message: `No frontmatter found in ${filePath}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  let raw: unknown;
  try {
    raw = parseYaml(frontmatter);
  } catch (err) {
    errors.push({
      code: "invalid_frontmatter",
      message: `YAML parse error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const result = AgentFileFrontmatterSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join("; ");
    errors.push({
      code: "invalid_frontmatter",
      message: `Schema validation error in ${filePath}: ${message}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const parsed = result.data;

  return {
    agentId: parsed.agentId,
    name: parsed.name,
    description: parsed.description,
    outputKind: parsed["output.kind"],
    adapterKind: parsed.adapterKind,
    model: parsed.model,
    temperature: parsed.temperature,
    turnMode: parsed.turnMode !== "normal" ? parsed.turnMode : undefined,
    tools: [...parsed.tools],
    userInvocable: parsed.userInvocable,
    argumentHint: parsed.argumentHint,
    includes: {
      instructions: [...parsed.includes.instructions],
      skills: [...parsed.includes.skills],
      globalSystemPrompt: parsed.includes.globalSystemPrompt,
    },
    body,
    sourcePath: filePath,
  };
}

// ---------------------------------------------------------------------------
// Instruction file parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single `.instructions.md` file into a `ResolvedInstructionAsset`.
 */
export async function parseInstructionFile(
  fs: ScannerFs,
  filePath: string,
  errors: ManifestError[],
): Promise<ResolvedInstructionAsset | undefined> {
  let content: string;
  try {
    content = await fs.readFile(filePath);
  } catch (err) {
    errors.push({
      code: "file_read_error",
      message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const { frontmatter, body } = splitFrontmatter(content);
  if (!frontmatter) {
    errors.push({
      code: "invalid_frontmatter",
      message: `No frontmatter found in ${filePath}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  let raw: unknown;
  try {
    raw = parseYaml(frontmatter);
  } catch (err) {
    errors.push({
      code: "invalid_frontmatter",
      message: `YAML parse error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const result = InstructionFileFrontmatterSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join("; ");
    errors.push({
      code: "invalid_frontmatter",
      message: `Schema validation error in ${filePath}: ${message}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const parsed = result.data;

  // Derive filename from path (e.g. ".agents-flow/instructions/coding.instructions.md" → "coding.instructions.md")
  const filename = filePath.split("/").pop() ?? filePath;

  return {
    filename,
    name: parsed.name,
    description: parsed.description,
    applyTo: parsed.applyTo,
    content: body,
    sourcePath: filePath,
  };
}

// ---------------------------------------------------------------------------
// Skill file parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single `SKILL.md` file into a `ResolvedSkillAsset`.
 */
export async function parseSkillFile(
  fs: ScannerFs,
  filePath: string,
  errors: ManifestError[],
): Promise<ResolvedSkillAsset | undefined> {
  let content: string;
  try {
    content = await fs.readFile(filePath);
  } catch (err) {
    errors.push({
      code: "file_read_error",
      message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const { frontmatter, body } = splitFrontmatter(content);
  if (!frontmatter) {
    errors.push({
      code: "invalid_frontmatter",
      message: `No frontmatter found in ${filePath}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  let raw: unknown;
  try {
    raw = parseYaml(frontmatter);
  } catch (err) {
    errors.push({
      code: "invalid_frontmatter",
      message: `YAML parse error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const result = SkillFileFrontmatterSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join("; ");
    errors.push({
      code: "invalid_frontmatter",
      message: `Schema validation error in ${filePath}: ${message}`,
      sourcePath: filePath,
    });
    return undefined;
  }

  const parsed = result.data;

  // Derive folder name from path (e.g. ".agents-flow/skills/search/SKILL.md" → "search")
  const parts = filePath.split("/");
  // path = .../skills/<folderName>/SKILL.md → index -2
  const folderName = parts.length >= 2
    ? (parts[parts.length - 2] ?? parts[parts.length - 1] ?? filePath)
    : (parts[0] ?? filePath);

  return {
    folderName,
    name: parsed.name,
    description: parsed.description,
    argumentHint: parsed.argumentHint,
    content: body,
    sourcePath: filePath,
  };
}
