import type { ScannerFs } from "./types.js";

/**
 * Recursively scan the `.agents-flow/` directory and return every file path
 * grouped by asset type.
 *
 * The scanner is platform-agnostic — it uses `ScannerFs` so it works with
 * both the browser WorkspaceApi and a Node.js `fs` back-end.
 */
export interface ScanResult {
  readonly globalSystemPromptPath: string | undefined;
  readonly agentPaths: readonly string[];
  readonly instructionPaths: readonly string[];
  readonly skillPaths: readonly string[];
  readonly errors: readonly ScanError[];
}

export interface ScanError {
  readonly code: "unexpected_file" | "stat_error";
  readonly message: string;
  readonly path: string;
}

const ROOT_DIR = ".agents-flow";
const AGENTS_DIR = `${ROOT_DIR}/agents`;
const INSTRUCTIONS_DIR = `${ROOT_DIR}/instructions`;
const SKILLS_DIR = `${ROOT_DIR}/skills`;
const GLOBAL_SYSTEM_PROMPT_FILE = `${ROOT_DIR}/global-system-prompt.md`;

/**
 * Scan the `.agents-flow/` directory tree using the provided file system.
 *
 * Returns grouped file paths ready for parsing. Does NOT read file contents.
 */
export async function scanAgentsFlowDir(fs: ScannerFs): Promise<ScanResult> {
  const agentPaths: string[] = [];
  const instructionPaths: string[] = [];
  const skillPaths: string[] = [];
  const errors: ScanError[] = [];

  // Check if .agents-flow exists
  const rootStat = await fs.stat(ROOT_DIR);
  if (!rootStat || rootStat.type !== "directory") {
    return {
      globalSystemPromptPath: undefined,
      agentPaths: [],
      instructionPaths: [],
      skillPaths: [],
      errors: [],
    };
  }

  // Check for global-system-prompt.md
  const globalStat = await fs.stat(GLOBAL_SYSTEM_PROMPT_FILE);
  const globalSystemPromptPath =
    globalStat?.type === "file" ? GLOBAL_SYSTEM_PROMPT_FILE : undefined;

  // Scan agents/
  await scanDirectory(fs, AGENTS_DIR, (name, path) => {
    if (name.endsWith(".agent.md")) {
      agentPaths.push(path);
    } else if (name.endsWith(".md")) {
      errors.push({
        code: "unexpected_file",
        message: `File in agents/ does not match *.agent.md naming: ${name}`,
        path,
      });
    }
  }, errors);

  // Scan instructions/
  await scanDirectory(fs, INSTRUCTIONS_DIR, (name, path) => {
    if (name.endsWith(".instructions.md")) {
      instructionPaths.push(path);
    } else if (name.endsWith(".md")) {
      errors.push({
        code: "unexpected_file",
        message: `File in instructions/ does not match *.instructions.md naming: ${name}`,
        path,
      });
    }
  }, errors);

  // Scan skills/ (each subfolder with SKILL.md)
  const skillDirs = await safeReadDir(fs, SKILLS_DIR, errors);
  if (skillDirs) {
    for (const entry of skillDirs) {
      const skillPath = `${SKILLS_DIR}/${entry}`;
      const skillStat = await fs.stat(skillPath);
      if (skillStat?.type === "directory") {
        const skillFilePath = `${skillPath}/SKILL.md`;
        const skillFileStat = await fs.stat(skillFilePath);
        if (skillFileStat?.type === "file") {
          skillPaths.push(skillFilePath);
        }
      }
    }
  }

  return {
    globalSystemPromptPath,
    agentPaths,
    instructionPaths,
    skillPaths,
    errors,
  };
}

async function scanDirectory(
  fs: ScannerFs,
  dirPath: string,
  onEntry: (name: string, path: string) => void,
  errors: ScanError[],
): Promise<void> {
  const entries = await safeReadDir(fs, dirPath, errors);
  if (!entries) return;
  for (const entry of entries) {
    onEntry(entry, `${dirPath}/${entry}`);
  }
}

async function safeReadDir(
  fs: ScannerFs,
  path: string,
  errors: ScanError[],
): Promise<readonly string[] | undefined> {
  try {
    const entries = await fs.readDir(path);
    return entries;
  } catch {
    errors.push({
      code: "stat_error",
      message: `Failed to read directory: ${path}`,
      path,
    });
    return undefined;
  }
}
