// @agentsflow/flow-schema
// Flow YAML schema definition, Zod validation, serialization, and migration.

export {
  FlowDefinitionSchema,
  FlowMetaSchema,
  AgentDefSchema,
  GraphSchema,
  NodeDefSchema,
  EdgeDefSchema,
  PortDefSchema,
  ParamDefSchema,
  CustomNodeSpecSchema,
  PortDataTypeSchema,
  RuntimeSchema,
  LayoutSchema,
  ExtensionsSchema,
  NodeBindingSchema,
  NodePositionSchema,
  type FlowDefinition,
  type FlowMeta,
  type AgentDef,
  type Graph,
  type NodeDef,
  type EdgeDef,
  type PortDef,
  type ParamDef,
  type CustomNodeSpec,
  type PortDataType,
  type Runtime,
  type Layout,
  type Extensions,
  type NodeBinding,
  type NodePosition,
} from "./schema/flow-definition.js";

export { parseFlowYaml, parseFlowYamlWithSemantics, serializeFlowYaml, validateFlowDefinition, safeValidateFlowDefinition, safeValidateFlowDefinitionWithSemantics } from "./lib/parse.js";
export { migrateFlow } from "./lib/migrate.js";
export { validateFlowSemantics, isPortTypeCompatible, type SemanticValidationResult } from "./lib/validate.js";

// .agents-flow prompt asset schemas
export {
  AgentFileFrontmatterSchema,
  InstructionFileFrontmatterSchema,
  SkillFileFrontmatterSchema,
  ResolvedAgentAssetSchema,
  ResolvedInstructionAssetSchema,
  ResolvedSkillAssetSchema,
  ManifestErrorCodeSchema,
  ManifestErrorSchema,
  PromptSegmentSchema,
  PromptAssetManifestSchema,
  ProviderPromptPackageSchema,
  type AgentFileFrontmatter,
  type InstructionFileFrontmatter,
  type SkillFileFrontmatter,
  type ResolvedAgentAsset,
  type ResolvedInstructionAsset,
  type ResolvedSkillAsset,
  type ManifestErrorCode,
  type ManifestError,
  type PromptSegment,
  type PromptAssetManifest,
  type ProviderPromptPackage,
  type NodeConfigOverrides,
  type RunInputData,
  type ProviderAdapter,
} from "./schema/agents-flow-assets.js";
