import type { FlowDefinition } from "../schema/flow-definition.js";

/**
 * Current supported schema versions.
 * The host must support at least N-1 versions.
 */
const SUPPORTED_VERSIONS = ["1.0", "2.0"];

/**
 * Migrate a flow definition from an older schema version to the latest.
 *
 * Migration strategy:
 *   - Each migration step is a pure function that transforms the data
 *   - Migrations are applied sequentially from the current version to the latest
 *   - The host must support at least N-1 schema versions
 */
export function migrateFlow(flow: FlowDefinition): FlowDefinition {
  const version = flow.meta.schemaVersion;

  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported flow schema version: ${version}. ` +
      `Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`
    );
  }

  // v1.0 → v2.0: add nodeKind, default ports, targetHandle
  if (version === "1.0") {
    return migrateV1toV2(flow);
  }

  return flow;
}

/**
 * Migrate v1.0 flow to v2.0.
 *
 * Changes:
 *   - nodeType (required) → nodeKind (derived) + nodeType (optional)
 *   - Add default inputPorts/outputPorts based on nodeType
 *   - Add targetHandle field to edges (optional, defaults to undefined)
 */
function migrateV1toV2(flow: FlowDefinition): FlowDefinition {
  const nodeKindMap: Record<string, string> = {
    agent: "agent.generic",
    router: "router.generic",
    input: "loader.input",
    output: "control.output",
    loop: "control.loop",
    parallel: "control.parallel",
  };

  const migratedNodes = flow.graph.nodes.map((node) => {
    const nodeType = node.nodeType ?? "agent";
    const nodeKind = node.nodeKind ?? nodeKindMap[nodeType] ?? nodeType;

    // Infer default ports from legacy nodeType if no ports defined
    const hasInputPorts = node.inputPorts && node.inputPorts.length > 0;
    const hasOutputPorts = node.outputPorts && node.outputPorts.length > 0;

    let inputPorts = node.inputPorts ?? [];
    let outputPorts = node.outputPorts ?? [];

    if (!hasInputPorts && !hasOutputPorts) {
      const defaults = getDefaultPortsForNodeType(nodeType);
      inputPorts = defaults.inputPorts;
      outputPorts = defaults.outputPorts;
    }

    return {
      ...node,
      nodeKind,
      nodeType: node.nodeType,
      inputPorts,
      outputPorts,
      params: node.params ?? [],
      category: node.category ?? inferCategory(nodeKind),
    };
  });

  const migratedEdges = flow.graph.edges.map((edge) => ({
    ...edge,
    targetHandle: edge.targetHandle,
    dataEdge: edge.dataEdge ?? false,
  }));

  return {
    ...flow,
    meta: {
      ...flow.meta,
      schemaVersion: "2.0",
    },
    graph: {
      ...flow.graph,
      nodes: migratedNodes,
      edges: migratedEdges,
    },
  };
}

function getDefaultPortsForNodeType(nodeType: string): {
  inputPorts: Array<{ portId: string; dataType: import("../schema/flow-definition.js").PortDataType; required: boolean; label: string }>;
  outputPorts: Array<{ portId: string; dataType: import("../schema/flow-definition.js").PortDataType; required: boolean; label: string }>;
} {
  switch (nodeType) {
    case "input":
      return {
        inputPorts: [],
        outputPorts: [
          { portId: "out", dataType: "any" as const, required: true, label: "Output" },
        ],
      };
    case "output":
      return {
        inputPorts: [
          { portId: "in", dataType: "any" as const, required: true, label: "Input" },
        ],
        outputPorts: [],
      };
    case "agent":
      return {
        inputPorts: [
          { portId: "in", dataType: "flow" as const, required: true, label: "In" },
          { portId: "prompt", dataType: "prompt" as const, required: false, label: "Prompt" },
          { portId: "data", dataType: "any" as const, required: false, label: "Data" },
        ],
        outputPorts: [
          { portId: "out", dataType: "flow" as const, required: true, label: "Out" },
          { portId: "result", dataType: "string" as const, required: false, label: "Result" },
        ],
      };
    case "router":
      return {
        inputPorts: [
          { portId: "in", dataType: "flow" as const, required: true, label: "In" },
        ],
        outputPorts: [
          { portId: "default", dataType: "flow" as const, required: true, label: "Default" },
        ],
      };
    case "loop":
      return {
        inputPorts: [
          { portId: "in", dataType: "flow" as const, required: true, label: "In" },
          { portId: "condition", dataType: "any" as const, required: false, label: "Condition" },
        ],
        outputPorts: [
          { portId: "loop", dataType: "flow" as const, required: true, label: "Loop" },
          { portId: "done", dataType: "flow" as const, required: true, label: "Done" },
        ],
      };
    case "parallel":
      return {
        inputPorts: [
          { portId: "in", dataType: "flow" as const, required: true, label: "In" },
        ],
        outputPorts: [
          { portId: "out", dataType: "flow" as const, required: true, label: "Out" },
        ],
      };
    default:
      return {
        inputPorts: [
          { portId: "in", dataType: "any" as const, required: true, label: "In" },
        ],
        outputPorts: [
          { portId: "out", dataType: "any" as const, required: true, label: "Out" },
        ],
      };
  }
}

function inferCategory(nodeKind: string): string {
  const parts = nodeKind.split(".");
  if (parts.length < 2) return "General";
  const prefix = parts[0]!.toLowerCase();
  switch (prefix) {
    case "loader": return "Loader";
    case "agent": return "Agent";
    case "control": return "Control";
    case "router": return "Router";
    default: return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
}
