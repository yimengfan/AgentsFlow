import { create } from "zustand";
import type { FlowDefinition, NodeDef, EdgeDef, NodePosition } from "@agentsflow/flow-schema";
import { parseFlowYaml, serializeFlowYaml, safeValidateFlowDefinition } from "@agentsflow/flow-schema";

/**
 * FlowStore — Zustand store for the flow editor state.
 *
 * Manages:
 *   - Current flow definition (parsed from YAML)
 *   - YAML source text (keeps raw text for Monaco editor)
 *   - Validation errors
 *   - Selected node/edge
 *   - Node positions (for React Flow layout)
 */
export interface FlowState {
  /** The parsed flow definition */
  flow: FlowDefinition | null;
  /** Raw YAML source */
  yamlSource: string;
  /** Validation errors */
  validationErrors: string[];
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Currently selected edge ID */
  selectedEdgeId: string | null;
  /** Whether there are unsaved changes */
  isDirty: boolean;
}

export interface FlowActions {
  /** Load a flow from YAML source */
  loadFromYaml: (yaml: string) => void;
  /** Update the YAML source and re-parse */
  updateYaml: (yaml: string) => void;
  /** Update the flow definition and re-serialize */
  updateFlow: (flow: FlowDefinition) => void;
  /** Select a node */
  selectNode: (nodeId: string | null) => void;
  /** Select an edge */
  selectEdge: (edgeId: string | null) => void;
  /** Add a node to the flow */
  addNode: (node: NodeDef) => void;
  /** Remove a node from the flow */
  removeNode: (nodeId: string) => void;
  /** Update a node */
  updateNode: (nodeId: string, patch: Partial<NodeDef>) => void;
  /** Add an edge */
  addEdge: (edge: EdgeDef) => void;
  /** Remove an edge */
  removeEdge: (edgeId: string) => void;
  /** Mark as saved (clear dirty flag) */
  markSaved: () => void;
  /** Get node positions for React Flow */
  getNodePositions: () => NodePosition[];
}

export type FlowStore = FlowState & FlowActions;

export const useFlowStore = create<FlowStore>((set, get) => ({
  flow: null,
  yamlSource: "",
  validationErrors: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  isDirty: false,

  loadFromYaml: (yaml: string) => {
    try {
      const flow = parseFlowYaml(yaml);
      const validation = safeValidateFlowDefinition(flow);
      set({
        flow: validation.success ? flow : null,
        yamlSource: yaml,
        validationErrors: validation.success ? [] : validation.error.errors.map((e) => e.message),
        isDirty: false,
      });
    } catch (err) {
      set({
        flow: null,
        yamlSource: yaml,
        validationErrors: [String(err)],
      });
    }
  },

  updateYaml: (yaml: string) => {
    try {
      const flow = parseFlowYaml(yaml);
      const validation = safeValidateFlowDefinition(flow);
      set({
        flow: validation.success ? flow : null,
        yamlSource: yaml,
        validationErrors: validation.success ? [] : validation.error.errors.map((e) => e.message),
        isDirty: true,
      });
    } catch (err) {
      set({
        yamlSource: yaml,
        validationErrors: [String(err)],
        isDirty: true,
      });
    }
  },

  updateFlow: (flow: FlowDefinition) => {
    const validation = safeValidateFlowDefinition(flow);
    const yaml = serializeFlowYaml(flow);
    set({
      flow: validation.success ? flow : null,
      yamlSource: yaml,
      validationErrors: validation.success ? [] : validation.error.errors.map((e) => e.message),
      isDirty: true,
    });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

  addNode: (node) => {
    const { flow } = get();
    if (!flow) return;
    const updated: FlowDefinition = {
      ...flow,
      graph: {
        ...flow.graph,
        nodes: [...flow.graph.nodes, node],
      },
    };
    get().updateFlow(updated);
  },

  removeNode: (nodeId) => {
    const { flow } = get();
    if (!flow) return;
    const updated: FlowDefinition = {
      ...flow,
      graph: {
        ...flow.graph,
        nodes: flow.graph.nodes.filter((n) => n.nodeId !== nodeId),
        edges: flow.graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      },
    };
    get().updateFlow(updated);
  },

  updateNode: (nodeId, patch) => {
    const { flow } = get();
    if (!flow) return;
    const updated: FlowDefinition = {
      ...flow,
      graph: {
        ...flow.graph,
        nodes: flow.graph.nodes.map((n) =>
          n.nodeId === nodeId ? { ...n, ...patch } : n,
        ),
      },
    };
    get().updateFlow(updated);
  },

  addEdge: (edge) => {
    const { flow } = get();
    if (!flow) return;
    const updated: FlowDefinition = {
      ...flow,
      graph: {
        ...flow.graph,
        edges: [...flow.graph.edges, edge],
      },
    };
    get().updateFlow(updated);
  },

  removeEdge: (edgeId) => {
    const { flow } = get();
    if (!flow) return;
    // Edge IDs may not be explicit; remove by source+target
    const updated: FlowDefinition = {
      ...flow,
      graph: {
        ...flow.graph,
        edges: flow.graph.edges.filter((e) => e.source !== edgeId && e.target !== edgeId),
      },
    };
    get().updateFlow(updated);
  },

  markSaved: () => set({ isDirty: false }),

  getNodePositions: () => {
    const { flow } = get();
    if (!flow?.layout?.positions) return [];
    return flow.layout.positions;
  },
}));
