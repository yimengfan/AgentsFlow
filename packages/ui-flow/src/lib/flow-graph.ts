import type { EdgeDef, FlowDefinition, NodeDef, PortDef } from "@agentsflow/flow-schema";
import { isPortTypeCompatible } from "@agentsflow/flow-schema";
import type { NodeSpec, NodeSpecRegistry } from "@agentsflow/node-spec-registry";
import { createRegistryWithExtensions } from "@agentsflow/node-spec-registry";

export interface FlowConnectionCandidate {
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null | undefined;
  readonly targetHandle?: string | null | undefined;
}

export interface FlowConnectionValidationResult {
  readonly valid: boolean;
  readonly edge?: EdgeDef;
  readonly reason?: string;
}

export function buildFlowRegistry(flow: FlowDefinition | null): NodeSpecRegistry {
  const customSpecs: NodeSpec[] = (flow?.extensions?.customNodeSpecs ?? []).map((spec) => ({
    kind: spec.kind,
    label: spec.label,
    category: spec.category,
    description: spec.description,
    icon: spec.icon,
    inputPorts: [...spec.inputPorts],
    outputPorts: [...spec.outputPorts],
    params: [...spec.params],
    ...(spec.legacyNodeType !== undefined ? { legacyNodeType: spec.legacyNodeType } : {}),
    tags: [...spec.tags],
    visible: spec.visible,
    maxInstances: spec.maxInstances,
    flowDirection: spec.flowDirection,
  }));

  return createRegistryWithExtensions(customSpecs);
}

export function resolveNodeSpec(flow: FlowDefinition | null, node: NodeDef): NodeSpec | undefined {
  const registry = buildFlowRegistry(flow);
  return registry.resolve(node.nodeKind, node.nodeType);
}

export function getNodeInputPorts(flow: FlowDefinition | null, node: NodeDef): readonly PortDef[] {
  if (node.inputPorts.length > 0) {
    return node.inputPorts;
  }
  return resolveNodeSpec(flow, node)?.inputPorts ?? [];
}

export function getNodeOutputPorts(flow: FlowDefinition | null, node: NodeDef): readonly PortDef[] {
  if (node.outputPorts.length > 0) {
    return node.outputPorts;
  }
  return resolveNodeSpec(flow, node)?.outputPorts ?? [];
}

export function countNodesByKind(flow: FlowDefinition | null): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  if (!flow) {
    return counts;
  }

  for (const node of flow.graph.nodes) {
    const kind = node.nodeKind ?? node.nodeType ?? "agent";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return counts;
}

export function validateConnection(
  flow: FlowDefinition | null,
  connection: FlowConnectionCandidate,
): FlowConnectionValidationResult {
  if (!flow) {
    return { valid: false, reason: "No flow loaded" };
  }

  if (!connection.source || !connection.target) {
    return { valid: false, reason: "Connection is missing source or target" };
  }

  if (connection.source === connection.target) {
    return { valid: false, reason: "A node cannot connect to itself" };
  }

  const sourceNode = flow.graph.nodes.find((node) => node.nodeId === connection.source);
  const targetNode = flow.graph.nodes.find((node) => node.nodeId === connection.target);

  if (!sourceNode || !targetNode) {
    return { valid: false, reason: "Connection references a missing node" };
  }

  const sourcePorts = getNodeOutputPorts(flow, sourceNode);
  const targetPorts = getNodeInputPorts(flow, targetNode);

  const resolvedSourceHandle = connection.sourceHandle ?? sourcePorts[0]?.portId;
  const resolvedTargetHandle = connection.targetHandle ?? targetPorts[0]?.portId;

  if (!resolvedSourceHandle || !resolvedTargetHandle) {
    return { valid: false, reason: "Connection requires explicit source and target ports" };
  }

  const sourcePort = sourcePorts.find((port) => port.portId === resolvedSourceHandle);
  const targetPort = targetPorts.find((port) => port.portId === resolvedTargetHandle);

  if (!sourcePort || !targetPort) {
    return { valid: false, reason: "Connection references a missing port" };
  }

  if (!isPortTypeCompatible(sourcePort.dataType, targetPort.dataType)) {
    return {
      valid: false,
      reason: `Port type mismatch: ${sourcePort.dataType} -> ${targetPort.dataType}`,
    };
  }

  const duplicatedEdge = flow.graph.edges.some(
    (edge) =>
      edge.source === connection.source
      && edge.target === connection.target
      && (edge.sourceHandle ?? undefined) === resolvedSourceHandle
      && (edge.targetHandle ?? undefined) === resolvedTargetHandle,
  );
  if (duplicatedEdge) {
    return { valid: false, reason: "These ports are already connected" };
  }

  const targetAlreadyBound = targetPort.dataType !== "flow" && flow.graph.edges.some(
    (edge) => edge.target === connection.target && edge.targetHandle === resolvedTargetHandle,
  );
  if (targetAlreadyBound) {
    return { valid: false, reason: "Data input ports only accept one upstream connection" };
  }

  const dataEdge = sourcePort.dataType !== "flow" || targetPort.dataType !== "flow";

  return {
    valid: true,
    edge: {
      source: connection.source,
      target: connection.target,
      sourceHandle: resolvedSourceHandle,
      targetHandle: resolvedTargetHandle,
      dataEdge,
    },
  };
}

export function upsertNodePosition(
  flow: FlowDefinition,
  nodeId: string,
  position: { x: number; y: number },
): FlowDefinition {
  const positions = flow.layout?.positions ?? [];
  const existingIndex = positions.findIndex((item) => item.nodeId === nodeId);
  const nextPositions = [...positions];

  if (existingIndex === -1) {
    nextPositions.push({ nodeId, x: position.x, y: position.y });
  } else {
    const existing = nextPositions[existingIndex];
    nextPositions[existingIndex] = {
      nodeId: existing?.nodeId ?? nodeId,
      ...(existing ? existing : {}),
      x: position.x,
      y: position.y,
    };
  }

  return {
    ...flow,
    layout: {
      ...flow.layout,
      positions: nextPositions,
    },
  };
}
