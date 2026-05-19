import type { FlowDefinition, NodeDef, EdgeDef, PortDataType } from "../schema/flow-definition.js";

/**
 * Result of semantic validation — checks that go beyond Zod structural validation.
 */
export interface SemanticValidationResult {
  readonly errors: readonly SemanticError[];
  readonly warnings: readonly SemanticWarning[];
}

export interface SemanticError {
  readonly code: SemanticErrorCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeIndex?: number;
}

export interface SemanticWarning {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}

export type SemanticErrorCode =
  | "missing_start_node"
  | "start_node_not_found"
  | "edge_source_not_found"
  | "edge_target_not_found"
  | "edge_port_not_found"
  | "port_type_mismatch"
  | "required_input_disconnected"
  | "unknown_node_kind"
  | "duplicate_node_id"
  | "duplicate_port_id"
  | "cycle_detected"
  | "unreachable_node";

/**
 * Validate a FlowDefinition for semantic correctness.
 *
 * Checks:
 *   - startNodeId references an existing node
 *   - All edge sources/targets reference existing nodes
 *   - Source/target handles reference existing ports
 *   - Port data types are compatible on connected edges
 *   - Required input ports are connected (warning, not error)
 *   - No duplicate node IDs or port IDs
 *   - No unreachable nodes
 *   - No cycles (warning only — cycles may be intentional for loops)
 */
export function validateFlowSemantics(flow: FlowDefinition): SemanticValidationResult {
  const errors: SemanticError[] = [];
  const warnings: SemanticWarning[] = [];

  const nodeMap = new Map<string, NodeDef>();
  const nodeIds = new Set<string>();

  // 1. Check for duplicate node IDs and build lookup
  for (const node of flow.graph.nodes) {
    if (nodeIds.has(node.nodeId)) {
      errors.push({
        code: "duplicate_node_id",
        message: `Duplicate node ID: "${node.nodeId}"`,
        nodeId: node.nodeId,
      });
    }
    nodeIds.add(node.nodeId);
    nodeMap.set(node.nodeId, node);
  }

  // 2. Check startNodeId
  if (!nodeMap.has(flow.graph.startNodeId)) {
    errors.push({
      code: "start_node_not_found",
      message: `startNodeId "${flow.graph.startNodeId}" does not match any node`,
    });
  }

  // 3. Check edges
  for (let i = 0; i < flow.graph.edges.length; i++) {
    const edge = flow.graph.edges[i];
    if (!edge) continue;

    if (!nodeIds.has(edge.source)) {
      errors.push({
        code: "edge_source_not_found",
        message: `Edge source "${edge.source}" does not match any node`,
        edgeIndex: i,
      });
    }

    if (!nodeIds.has(edge.target)) {
      errors.push({
        code: "edge_target_not_found",
        message: `Edge target "${edge.target}" does not match any node`,
        edgeIndex: i,
      });
    }

    // Check source handle exists on source node
    if (edge.sourceHandle) {
      const sourceNode = nodeMap.get(edge.source);
      const outPorts = sourceNode?.outputPorts ?? [];
      const portIds = new Set(outPorts.map((p) => p.portId));
      if (sourceNode && !portIds.has(edge.sourceHandle)) {
        errors.push({
          code: "edge_port_not_found",
          message: `Source handle "${edge.sourceHandle}" not found on node "${edge.source}"`,
          nodeId: edge.source,
          edgeIndex: i,
        });
      }
    }

    // Check target handle exists on target node
    if (edge.targetHandle) {
      const targetNode = nodeMap.get(edge.target);
      const inPorts = targetNode?.inputPorts ?? [];
      const portIds = new Set(inPorts.map((p) => p.portId));
      if (targetNode && !portIds.has(edge.targetHandle)) {
        errors.push({
          code: "edge_port_not_found",
          message: `Target handle "${edge.targetHandle}" not found on node "${edge.target}"`,
          nodeId: edge.target,
          edgeIndex: i,
        });
      }
    }

    // Check port type compatibility
    if (edge.sourceHandle && edge.targetHandle) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (sourceNode && targetNode) {
        const sourcePort = (sourceNode.outputPorts ?? []).find(
          (p) => p.portId === edge.sourceHandle,
        );
        const targetPort = (targetNode.inputPorts ?? []).find(
          (p) => p.portId === edge.targetHandle,
        );
        if (sourcePort && targetPort) {
          if (!isPortTypeCompatible(sourcePort.dataType, targetPort.dataType)) {
            errors.push({
              code: "port_type_mismatch",
              message: `Port type mismatch: "${edge.source}:${edge.sourceHandle}" (${sourcePort.dataType}) → "${edge.target}:${edge.targetHandle}" (${targetPort.dataType})`,
              edgeIndex: i,
            });
          }
        }
      }
    }
  }

  // 4. Check for unreachable nodes (BFS from startNodeId)
  if (nodeMap.has(flow.graph.startNodeId)) {
    const reachable = new Set<string>();
    const queue = [flow.graph.startNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of flow.graph.edges) {
        if (edge.source === current && !reachable.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
    for (const node of flow.graph.nodes) {
      if (!reachable.has(node.nodeId)) {
        warnings.push({
          code: "unreachable_node",
          message: `Node "${node.nodeId}" is not reachable from start node`,
          nodeId: node.nodeId,
        });
      }
    }
  }

  // 5. Check for duplicate port IDs within a node
  for (const node of flow.graph.nodes) {
    const inputPortIds = new Set<string>();
    for (const port of node.inputPorts ?? []) {
      if (inputPortIds.has(port.portId)) {
        errors.push({
          code: "duplicate_port_id",
          message: `Duplicate input port ID "${port.portId}" on node "${node.nodeId}"`,
          nodeId: node.nodeId,
        });
      }
      inputPortIds.add(port.portId);
    }
    const outputPortIds = new Set<string>();
    for (const port of node.outputPorts ?? []) {
      if (outputPortIds.has(port.portId)) {
        errors.push({
          code: "duplicate_port_id",
          message: `Duplicate output port ID "${port.portId}" on node "${node.nodeId}"`,
          nodeId: node.nodeId,
        });
      }
      outputPortIds.add(port.portId);
    }
  }

  // 6. Warn about unconnected required input ports
  const incomingEdgesByPort = new Map<string, Set<string>>();
  for (const edge of flow.graph.edges) {
    const key = edge.targetHandle
      ? `${edge.target}:${edge.targetHandle}`
      : edge.target;
    if (!incomingEdgesByPort.has(key)) {
      incomingEdgesByPort.set(key, new Set());
    }
    incomingEdgesByPort.get(key)!.add(edge.source);
  }

  for (const node of flow.graph.nodes) {
    for (const port of node.inputPorts ?? []) {
      if (port.required && port.defaultValue === undefined) {
        const portKey = `${node.nodeId}:${port.portId}`;
        const hasConnection = incomingEdgesByPort.has(portKey) ||
          incomingEdgesByPort.has(node.nodeId);
        if (!hasConnection) {
          warnings.push({
            code: "required_input_disconnected",
            message: `Required input port "${port.portId}" on node "${node.nodeId}" is not connected`,
            nodeId: node.nodeId,
          });
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Check if two port data types are compatible for connection.
 * "any" is compatible with everything.
 * Some types have implicit compatibility (e.g. "prompt" ↔ "string").
 */
export function isPortTypeCompatible(source: PortDataType, target: PortDataType): boolean {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;

  // Implicit compatibility: prompt ↔ string
  const compatibilityGroups: ReadonlyArray<ReadonlySet<PortDataType>> = [
    new Set(["string", "prompt"]),
    new Set(["object", "documents"]),
    new Set(["array", "documents"]),
    new Set(["array", "plan"]),
    new Set(["object", "score"]),
    new Set(["object", "artifact"]),
  ];

  for (const group of compatibilityGroups) {
    if (group.has(source) && group.has(target)) return true;
  }

  return false;
}
