export {
  type NodeSpec,
  NodeSpecBase,
  NodeSpecRegistry,
  createDefaultRegistry,
  createRegistryWithExtensions,
  BUILTIN_NODE_CLASSES,
} from "./specs.js";

// Re-export individual node spec classes for direct import
export { LoaderWorkDirSpec } from "./nodes/loader-work-dir.js";
export { LoaderHttpAuthSpec } from "./nodes/loader-http-auth.js";
export { LoaderLocalDirSpec } from "./nodes/loader-local-dir.js";
export { AgentMainSpec } from "./nodes/agent-main.js";
export { AgentSubSpec } from "./nodes/agent-sub.js";
export { ControlPlanLoopSpec } from "./nodes/control-plan-loop.js";
export { ControlFinishSpec } from "./nodes/control-finish.js";