import { create } from "zustand";

/**
 * WorkspaceStore — manages flow list, open tabs, and per-document state.
 *
 * OWNS: which flows are open, which tab is active, per-flow YAML/parse/dirty/selection.
 * DOES NOT OWN: shell chrome (visibility, panel sizes) — that's WorkbenchStore.
 *
 * Uses usePlatform() for data fetching at the component level;
 * the store itself is pure state and does not import platform-adapter.
 */

import type { FlowDefinition } from "@agentsflow/flow-schema";
import {
  parseFlowYaml,
  serializeFlowYaml,
  safeValidateFlowDefinition,
} from "@agentsflow/flow-schema";

/** Per-document editing state */
export interface DocumentState {
  /** Flow path (unique key) */
  flowPath: string;
  /** Raw YAML source */
  yamlSource: string;
  /** Parsed flow definition (null if YAML is invalid) */
  flow: FlowDefinition | null;
  /** Validation errors */
  validationErrors: readonly string[];
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Currently selected edge ID */
  selectedEdgeId: string | null;
}

export interface WorkspaceState {
  /** Available flow summaries (from platform flow.list()) */
  flowList: readonly { flowPath: string; name: string; nodeCount: number }[];
  /** Open documents keyed by flowPath */
  documents: ReadonlyMap<string, DocumentState>;
  /** Ordered list of open tab flowPaths */
  openTabs: readonly string[];
  /** Currently active tab flowPath */
  activeFlowPath: string | null;
  /** Loading state */
  isLoading: boolean;
}

export interface WorkspaceActions {
  /** Set flow list from platform data */
  setFlowList: (list: readonly { flowPath: string; name: string; nodeCount: number }[]) => void;
  /** Open a flow tab (creates DocumentState if needed) */
  openFlow: (flowPath: string, yamlSource: string) => void;
  /** Close a flow tab */
  closeFlow: (flowPath: string) => void;
  /** Set active tab */
  setActiveFlow: (flowPath: string | null) => void;
  /** Update YAML source for a document */
  updateYaml: (flowPath: string, yaml: string) => void;
  /** Update parsed flow for a document */
  updateFlow: (flowPath: string, flow: FlowDefinition) => void;
  /** Select a node in the active document */
  selectNode: (nodeId: string | null) => void;
  /** Select an edge in the active document */
  selectEdge: (edgeId: string | null) => void;
  /** Mark a document as saved */
  markSaved: (flowPath: string) => void;
  /** Get the active document state */
  getActiveDocument: () => DocumentState | null;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  flowList: [],
  documents: new Map(),
  openTabs: [],
  activeFlowPath: null,
  isLoading: false,

  setFlowList: (list) => set({ flowList: list }),

  openFlow: (flowPath, yamlSource) => {
    const { documents, openTabs } = get();
    if (documents.has(flowPath)) {
      // Already open — just activate
      set({ activeFlowPath: flowPath });
      return;
    }

    // Parse and validate
    let flow: FlowDefinition | null = null;
    let validationErrors: readonly string[] = [];
    try {
      const parsed = parseFlowYaml(yamlSource);
      const validation = safeValidateFlowDefinition(parsed);
      if (validation.success) {
        flow = parsed;
      } else {
        validationErrors = validation.error.errors.map((e) => e.message);
      }
    } catch (err) {
      validationErrors = [String(err)];
    }

    const doc: DocumentState = {
      flowPath,
      yamlSource,
      flow,
      validationErrors,
      isDirty: false,
      selectedNodeId: null,
      selectedEdgeId: null,
    };

    const newDocs = new Map(documents);
    newDocs.set(flowPath, doc);

    set({
      documents: newDocs,
      openTabs: [...openTabs, flowPath],
      activeFlowPath: flowPath,
    });
  },

  closeFlow: (flowPath) => {
    const { documents, openTabs, activeFlowPath } = get();
    const newDocs = new Map(documents);
    newDocs.delete(flowPath);

    const newTabs = openTabs.filter((p) => p !== flowPath);
    let newActive = activeFlowPath;
    if (activeFlowPath === flowPath) {
      // Switch to adjacent tab, or null
      const idx = openTabs.indexOf(flowPath);
      newActive = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
    }

    set({
      documents: newDocs,
      openTabs: newTabs,
      activeFlowPath: newActive,
    });
  },

  setActiveFlow: (flowPath) => set({ activeFlowPath: flowPath }),

  updateYaml: (flowPath, yaml) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc) return;

    let flow: FlowDefinition | null = null;
    let validationErrors: readonly string[] = [];
    try {
      const parsed = parseFlowYaml(yaml);
      const validation = safeValidateFlowDefinition(parsed);
      if (validation.success) {
        flow = parsed;
      } else {
        validationErrors = validation.error.errors.map((e) => e.message);
      }
    } catch (err) {
      validationErrors = [String(err)];
    }

    const updated: DocumentState = {
      ...doc,
      yamlSource: yaml,
      flow,
      validationErrors,
      isDirty: true,
    };

    const newDocs = new Map(documents);
    newDocs.set(flowPath, updated);
    set({ documents: newDocs });
  },

  updateFlow: (flowPath, flow) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc) return;

    const validation = safeValidateFlowDefinition(flow);
    const yaml = serializeFlowYaml(flow);
    const validationErrors = validation.success
      ? [] as readonly string[]
      : validation.error.errors.map((e) => e.message);

    const updated: DocumentState = {
      ...doc,
      flow: validation.success ? flow : null,
      yamlSource: yaml,
      validationErrors,
      isDirty: true,
    };

    const newDocs = new Map(documents);
    newDocs.set(flowPath, updated);
    set({ documents: newDocs });
  },

  selectNode: (nodeId) => {
    const { activeFlowPath, documents } = get();
    if (!activeFlowPath) return;
    const doc = documents.get(activeFlowPath);
    if (!doc) return;

    const updated: DocumentState = {
      ...doc,
      selectedNodeId: nodeId,
      selectedEdgeId: null,
    };

    const newDocs = new Map(documents);
    newDocs.set(activeFlowPath, updated);
    set({ documents: newDocs });
  },

  selectEdge: (edgeId) => {
    const { activeFlowPath, documents } = get();
    if (!activeFlowPath) return;
    const doc = documents.get(activeFlowPath);
    if (!doc) return;

    const updated: DocumentState = {
      ...doc,
      selectedEdgeId: edgeId,
      selectedNodeId: null,
    };

    const newDocs = new Map(documents);
    newDocs.set(activeFlowPath, updated);
    set({ documents: newDocs });
  },

  markSaved: (flowPath) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc) return;

    const updated: DocumentState = { ...doc, isDirty: false };
    const newDocs = new Map(documents);
    newDocs.set(flowPath, updated);
    set({ documents: newDocs });
  },

  getActiveDocument: () => {
    const { activeFlowPath, documents } = get();
    if (!activeFlowPath) return null;
    return documents.get(activeFlowPath) ?? null;
  },
}));