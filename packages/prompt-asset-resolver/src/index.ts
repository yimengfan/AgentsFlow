// @agentsflow/prompt-asset-resolver
// Scans .agents-flow/ directory, parses frontmatter, resolves prompt assets,
// and assembles provider prompt packages.

export type { ScannerFs } from "./types.js";

export { scanAgentsFlowDir, type ScanResult, type ScanError } from "./scanner.js";

export {
  parseAgentFile,
  parseInstructionFile,
  parseSkillFile,
} from "./parser.js";

export { resolvePromptAssetManifest } from "./resolver.js";

export { assemblePromptPackage } from "./prompt-assembler.js";

export {
  BuiltInProviderAdapter,
  builtInAdapter,
  packageForBuiltInMode,
  isAgentResolvable,
  getResolvableAgentIds,
  getAgentDropdownItems,
} from "./provider-package.js";

export {
  ProviderAdapterRegistry,
  defaultAdapterRegistry,
} from "./adapter-registry.js";
