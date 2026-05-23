import type {
  PromptAssetManifest,
  ResolvedAgentAsset,
  ResolvedInstructionAsset,
  ResolvedSkillAsset,
  ManifestError,
} from "@agentsflow/flow-schema";
import type { ScannerFs } from "./types.js";
import { scanAgentsFlowDir, type ScanResult } from "./scanner.js";
import { parseAgentFile, parseInstructionFile, parseSkillFile } from "./parser.js";

/**
 * Build a `PromptAssetManifest` by scanning and parsing the `.agents-flow/`
 * directory using the provided file system.
 *
 * This is the main entry point for the resolver. It:
 * 1. Scans the directory tree
 * 2. Parses all frontmatter
 * 3. Validates cross-references (duplicate agentIds, missing includes)
 * 4. Returns the complete manifest
 */
export async function resolvePromptAssetManifest(
  fs: ScannerFs,
): Promise<PromptAssetManifest> {
  const errors: ManifestError[] = [];

  // 1. Scan directory
  const scanResult = await scanAgentsFlowDir(fs);
  errors.push(...scanResult.errors);

  // 2. Parse global system prompt
  let globalSystemPrompt: string | undefined;
  if (scanResult.globalSystemPromptPath) {
    try {
      globalSystemPrompt = await fs.readFile(scanResult.globalSystemPromptPath);
    } catch (err) {
      errors.push({
        code: "file_read_error",
        message: `Failed to read global system prompt: ${err instanceof Error ? err.message : String(err)}`,
        sourcePath: scanResult.globalSystemPromptPath,
      });
    }
  }

  // 3. Parse instruction files
  // Keyed by `name` (e.g. "plan-format") so that agent includes can reference
  // instructions by their short name rather than the full filename.
  const instructions = new Map<string, ResolvedInstructionAsset>();
  const instructionPromises = scanResult.instructionPaths.map(async (path) => {
    const result = await parseInstructionFile(fs, path, errors);
    if (result) {
      if (instructions.has(result.name)) {
        errors.push({
          code: "duplicate_agent_id",
          message: `Duplicate instruction name "${result.name}" found in ${result.sourcePath} (already defined in ${instructions.get(result.name)?.sourcePath})`,
          sourcePath: result.sourcePath,
        });
      } else {
        instructions.set(result.name, result);
      }
    }
  });
  await Promise.all(instructionPromises);

  // 4. Parse skill files
  const skills = new Map<string, ResolvedSkillAsset>();
  const skillPromises = scanResult.skillPaths.map(async (path) => {
    const result = await parseSkillFile(fs, path, errors);
    if (result) {
      skills.set(result.folderName, result);
    }
  });
  await Promise.all(skillPromises);

  // 5. Parse agent files
  const agents = new Map<string, ResolvedAgentAsset>();
  const agentPromises = scanResult.agentPaths.map(async (path) => {
    const result = await parseAgentFile(fs, path, errors);
    if (result) {
      if (agents.has(result.agentId)) {
        errors.push({
          code: "duplicate_agent_id",
          message: `Duplicate agentId "${result.agentId}" found in ${path} (already defined in ${agents.get(result.agentId)?.sourcePath})`,
          sourcePath: path,
          agentId: result.agentId,
        });
      } else {
        agents.set(result.agentId, result);
      }
    }
  });
  await Promise.all(agentPromises);

  // 6. Validate cross-references (missing includes)
  for (const agent of agents.values()) {
    for (const instructionRef of agent.includes.instructions) {
      if (!instructions.has(instructionRef)) {
        errors.push({
          code: "missing_include",
          message: `Agent "${agent.agentId}" references instruction "${instructionRef}" which was not found`,
          sourcePath: agent.sourcePath,
          agentId: agent.agentId,
        });
      }
    }
    for (const skillRef of agent.includes.skills) {
      if (!skills.has(skillRef)) {
        errors.push({
          code: "missing_include",
          message: `Agent "${agent.agentId}" references skill "${skillRef}" which was not found`,
          sourcePath: agent.sourcePath,
          agentId: agent.agentId,
        });
      }
    }
  }

  return {
    globalSystemPrompt,
    agents,
    instructions,
    skills,
    errors,
  };
}
