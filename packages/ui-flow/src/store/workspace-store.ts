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

import type { FlowDefinition, NodeDef, EdgeDef, PromptAssetManifest } from "@agentsflow/flow-schema";
import type { FlowSummary } from "@agentsflow/shared-contracts";
import type { NodeSpec } from "@agentsflow/node-spec-registry";
import type { PlatformApi } from "@agentsflow/platform-adapter";
import {
  parseFlowYaml,
  serializeFlowYaml,
  safeValidateFlowDefinition,
} from "@agentsflow/flow-schema";
import { upsertNodePosition, validateConnection } from "../lib/flow-graph.js";

/** Document type — determines how the center workspace renders the file. */
export type DocumentType = "flow" | "text" | "binary";

/** Per-document editing state */
export interface DocumentState {
  /** Flow path (unique key) */
  flowPath: string;
  /** Document type — flow, text, or binary */
  docType: DocumentType;
  /** Raw YAML source */
  yamlSource: string;
  /** Parsed flow definition (null if YAML is invalid or not a flow doc) */
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
  flowList: readonly FlowSummary[];
  /** Open documents keyed by flowPath */
  documents: ReadonlyMap<string, DocumentState>;
  /** Ordered list of open tab flowPaths */
  openTabs: readonly string[];
  /** Currently active tab flowPath */
  activeFlowPath: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Resolved prompt asset manifest from .agents-flow/ directory (null if not loaded) */
  promptAssetManifest: PromptAssetManifest | null;
}

export interface WorkspaceActions {
  /** Set flow list from platform data */
  setFlowList: (list: readonly FlowSummary[]) => void;
  /** Open a flow tab (creates DocumentState if needed) */
  openFlow: (flowPath: string, yamlSource: string) => void;
  /** Open a non-flow file tab (text or binary) */
  openFile: (filePath: string, content: string, docType: "text" | "binary") => void;
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
  /** Add a node to the active flow, created from a NodeSpec at the given canvas position */
  addNode: (flowPath: string, spec: NodeSpec, position: { x: number; y: number }) => string;
  /** Add an edge to a flow if it passes connection constraints */
  addEdge: (flowPath: string, edge: EdgeDef) => { success: boolean; error?: string };
  /** Persist a node move from the canvas */
  moveNode: (flowPath: string, nodeId: string, position: { x: number; y: number }) => void;
  /** Update a single config value on a node */
  updateNodeConfig: (flowPath: string, nodeId: string, paramId: string, value: unknown) => void;
  /** Update the agentRef on a node (binding to a .agents-flow agent definition) */
  updateNodeAgentRef: (flowPath: string, nodeId: string, agentRef: string | undefined) => void;
  /** Remove a node from a flow by nodeId */
  removeNode: (flowPath: string, nodeId: string) => void;
  /** Remove an edge from a flow by source+target identifiers */
  removeEdge: (flowPath: string, source: string, target: string, sourceHandle?: string, targetHandle?: string) => void;
  /** Create a new untitled flow with a starter template and open it */
  createFlow: () => string;
  /** Create a new flow file in the given directory, open it, and return its path */
  createFlowInWorkspace: (dirPath: string, fileName: string, platform: PlatformApi) => Promise<string>;
  /** Set the prompt asset manifest (called after scanning .agents-flow/) */
  setPromptAssetManifest: (manifest: PromptAssetManifest | null) => void;
  /** Save a flow to disk via platform API and mark it as saved */
  saveFlow: (flowPath: string, platform: PlatformApi) => Promise<void>;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

/** Counter for generating unique untitled flow names. */
let untitledCounter = 0;

function buildUpdatedDocument(doc: DocumentState, flow: FlowDefinition): DocumentState {
  const validation = safeValidateFlowDefinition(flow);
  const yamlSource = serializeFlowYaml(flow);
  const validationErrors = validation.success
    ? [] as readonly string[]
    : validation.error.errors.map((error) => error.message);

  return {
    ...doc,
    flow: validation.success ? flow : null,
    yamlSource,
    validationErrors,
    isDirty: true,
  };
}

function commitDocument(
  setState: (partial: Partial<WorkspaceStore>) => void,
  documents: ReadonlyMap<string, DocumentState>,
  flowPath: string,
  doc: DocumentState,
): void {
  const nextDocuments = new Map(documents);
  nextDocuments.set(flowPath, doc);
  setState({ documents: nextDocuments });
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  flowList: [],
  documents: new Map(),
  openTabs: [],
  activeFlowPath: null,
  isLoading: false,
  promptAssetManifest: null,

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
      docType: "flow",
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

  openFile: (filePath, content, docType) => {
    const { documents, openTabs } = get();
    if (documents.has(filePath)) {
      // Already open — just activate
      set({ activeFlowPath: filePath });
      return;
    }

    const doc: DocumentState = {
      flowPath: filePath,
      docType,
      yamlSource: content,
      flow: null,
      validationErrors: [],
      isDirty: false,
      selectedNodeId: null,
      selectedEdgeId: null,
    };

    const newDocs = new Map(documents);
    newDocs.set(filePath, doc);

    set({
      documents: newDocs,
      openTabs: [...openTabs, filePath],
      activeFlowPath: filePath,
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

    // Only re-parse as flow if this is a flow document
    if (doc.docType !== "flow") {
      const updated: DocumentState = {
        ...doc,
        yamlSource: yaml,
        isDirty: true,
      };
      const newDocs = new Map(documents);
      newDocs.set(flowPath, updated);
      set({ documents: newDocs });
      return;
    }

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

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, flow));
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

  addNode: (flowPath, spec, position) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return "";

    if (spec.maxInstances > 0) {
      const instanceCount = doc.flow.graph.nodes.filter((node) => node.nodeKind === spec.kind).length;
      if (instanceCount >= spec.maxInstances) {
        return "";
      }
    }

    // Generate a unique node ID: kind prefix + random suffix
    const kindPrefix = spec.kind.replace(/\./g, "_");
    const suffix = Math.random().toString(36).slice(2, 8);
    const nodeId = `${kindPrefix}_${suffix}`;

    // Build NodeDef from spec
    const newNode: NodeDef = {
      nodeId,
      nodeKind: spec.kind,
      label: spec.label,
      category: spec.category,
      config: {},
      inputPorts: [...spec.inputPorts],
      outputPorts: [...spec.outputPorts],
      params: [...spec.params],
      // Set agentRef from spec's presetAgentRef (e.g. "main-agent", "sub-agent")
      ...(spec.presetAgentRef ? { agentRef: spec.presetAgentRef } : {}),
    };

    // Add position to layout
    const currentPositions = doc.flow.layout?.positions ?? [];
    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        nodes: [...doc.flow.graph.nodes, newNode],
      },
      layout: {
        ...doc.flow.layout,
        positions: [...currentPositions, { nodeId, x: position.x, y: position.y }],
      },
    };

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));

    return nodeId;
  },

  addEdge: (flowPath, edge) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) {
      return { success: false, error: "Flow document not found" };
    }

    const validation = validateConnection(doc.flow, edge);
    if (!validation.valid || !validation.edge) {
      return { success: false, ...(validation.reason ? { error: validation.reason } : {}) };
    }

    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        edges: [...doc.flow.graph.edges, validation.edge],
      },
    };

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));
    return { success: true };
  },

  moveNode: (flowPath, nodeId, position) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return;

    const updatedFlow = upsertNodePosition(doc.flow, nodeId, position);
    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));
  },

  updateNodeConfig: (flowPath, nodeId, paramId, value) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return;

    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        nodes: doc.flow.graph.nodes.map((node) => {
          if (node.nodeId !== nodeId) {
            return node;
          }

          const nextConfig = {
            ...(node.config ?? {}),
            [paramId]: value,
          };

          return {
            ...node,
            config: nextConfig,
          };
        }),
      },
    };

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));
  },

  updateNodeAgentRef: (flowPath, nodeId, agentRef) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return;

    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        nodes: doc.flow.graph.nodes.map((node) => {
          if (node.nodeId !== nodeId) return node;
          const { agentRef: _unused, ...rest } = node;
          if (agentRef === undefined) return rest;
          return { ...rest, agentRef };
        }),
      },
    };

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));
  },

  removeNode: (flowPath, nodeId) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return;

    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        nodes: doc.flow.graph.nodes.filter((n) => n.nodeId !== nodeId),
        edges: doc.flow.graph.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        ),
      },
      layout: {
        ...doc.flow.layout,
        positions: (doc.flow.layout?.positions ?? []).filter(
          (p) => p.nodeId !== nodeId,
        ),
      },
    };

    const updated: DocumentState = {
      ...buildUpdatedDocument(doc, updatedFlow),
      selectedNodeId: doc.selectedNodeId === nodeId ? null : doc.selectedNodeId,
    };

    commitDocument(set, documents, flowPath, updated);
  },

  removeEdge: (flowPath, source, target, sourceHandle, targetHandle) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc || !doc.flow) return;

    const updatedFlow: FlowDefinition = {
      ...doc.flow,
      graph: {
        ...doc.flow.graph,
        edges: doc.flow.graph.edges.filter((e) => {
          if (e.source !== source || e.target !== target) return true;
          if (sourceHandle !== undefined && e.sourceHandle !== sourceHandle) return true;
          if (targetHandle !== undefined && e.targetHandle !== targetHandle) return true;
          return false;
        }),
      },
    };

    commitDocument(set, documents, flowPath, buildUpdatedDocument(doc, updatedFlow));
  },

  getActiveDocument: () => {
    const { activeFlowPath, documents } = get();
    if (!activeFlowPath) return null;
    return documents.get(activeFlowPath) ?? null;
  },

  createFlow: () => {
    untitledCounter++;
    const name = `Untitled-${untitledCounter}`;
    const flowPath = `untitled://${name}`;
    const yamlSource = generateStarterYaml(name);
    get().openFlow(flowPath, yamlSource);
    return flowPath;
  },

  createFlowInWorkspace: async (dirPath: string, fileName: string, platform: PlatformApi): Promise<string> => {
    // Ensure the fileName ends with .yml
    const normalizedName = fileName.endsWith(".yml") || fileName.endsWith(".yaml")
      ? fileName
      : `${fileName}.yml`;

    // Build the full file path
    const sep = dirPath.includes("/") ? "/" : "\\";
    const filePath = `${dirPath}${sep}${normalizedName}`;

    // Extract name for the YAML metadata
    const name = normalizedName.replace(/\.(yml|yaml)$/, "");
    const yamlSource = generateStarterYaml(name);

    // Write the file via platform API
    await platform.workspace.createFile(filePath, yamlSource);

    // Open the new flow
    get().openFlow(filePath, yamlSource);

    return filePath;
  },

  setPromptAssetManifest: (manifest) => set({ promptAssetManifest: manifest }),

  saveFlow: async (flowPath, platform) => {
    const { documents } = get();
    const doc = documents.get(flowPath);
    if (!doc) return;

    // Use platform.flow.save for flow files, or platform.workspace.createFile for others
    if (doc.docType === "flow" && platform.flow?.save) {
      await platform.flow.save(flowPath, doc.yamlSource);
    } else {
      await platform.workspace.createFile(flowPath, doc.yamlSource);
    }

    // Mark as saved after successful write
    get().markSaved(flowPath);
  },
}));

// ---------------------------------------------------------------------------
// Starter YAML template — left-to-right plan-execute-evaluate flow
// Flow direction: horizontal (left → right)
// Nodes: loader.work-dir → agent.main (plan) → agent.sub (execute) → agent.main (evaluate) → control.finish
// ---------------------------------------------------------------------------

function generateStarterYaml(name: string): string {
  return `agentsflow: true
meta:
  schemaVersion: '1.0'
  name: ${name}
  description: 默认流程：主Agent生成计划 → 子Agent执行 → 主Agent评分 → 结束
  version: 0.1.0
  tags:
    - starter
agents:
  agentDefs:
    - agentId: main-agent
      adapterKind: pi-mono
      modelProfile:
        model: deepseek-v4-flash
        systemPrompt: You are a planning and evaluation agent.
      adapterConfig:
        transport: deepseek
      toolPolicy:
        allowedCapabilities: []
        blockedTools: []
        approvalRequirement: destructive_only
      memoryPolicy:
        visibleScopes:
          - run
        writableScopes:
          - run
      subagentPolicy:
        allowedAgents:
          - sub-agent
        switchModes:
          - flow-forced
        returnStrategy: summary-only
      timeouts:
        turnMs: 60000
        sessionMs: 300000
      budgets:
        maxSteps: 10
    - agentId: sub-agent
      adapterKind: pi-mono
      modelProfile:
        model: deepseek-v4-flash
        systemPrompt: You are an execution agent. Carry out the plan.
      adapterConfig:
        transport: deepseek
      toolPolicy:
        allowedCapabilities: []
        blockedTools: []
        approvalRequirement: destructive_only
      memoryPolicy:
        visibleScopes:
          - run
        writableScopes:
          - run
          - node
      subagentPolicy:
        allowedAgents: []
        switchModes: []
        returnStrategy: summary-only
      timeouts:
        turnMs: 60000
        sessionMs: 300000
      budgets:
        maxSteps: 20
graph:
  nodes:
    - nodeId: loader-workdir
      nodeKind: loader.work-dir
      label: 加载工作目录
      category: Loader/WorkDir
      config: {}
      inputPorts:
        - portId: in
          dataType: flow
          required: true
      outputPorts:
        - portId: out
          dataType: flow
        - portId: data
          dataType: documents
      params: []
    - nodeId: main-prompt
      nodeKind: agent.main
      label: 主 Agent
      category: Agent/Main
      agentRef: main-agent
      config:
        turnMode: plan
        userPrompt: 请根据用户输入生成一个简洁可执行的计划，输出重点步骤。
      inputPorts:
        - portId: in
          dataType: flow
        - portId: prompt
          dataType: prompt
        - portId: data
          dataType: any
      outputPorts:
        - portId: out
          dataType: flow
        - portId: result
          dataType: string
        - portId: plan
          dataType: plan
      params: []
    - nodeId: sub-execute
      nodeKind: agent.sub
      label: 子 Agent
      category: Agent/Sub
      agentRef: sub-agent
      config:
        turnMode: normal
        systemPrompt: 按照计划步骤执行任务。
      inputPorts:
        - portId: in
          dataType: flow
        - portId: prompt
          dataType: prompt
        - portId: data
          dataType: any
      outputPorts:
        - portId: out
          dataType: flow
        - portId: result
          dataType: string
      params: []
    - nodeId: main-evaluate
      nodeKind: agent.main
      label: 主 Agent
      category: Agent/Main
      agentRef: main-agent
      config:
        turnMode: evaluate
        evaluatePrompt: >-
          评估执行结果，给出 0-1 评分。返回 JSON：
          {"score": <number>, "canComplete": <boolean>, "reason": "<string>"}
      inputPorts:
        - portId: in
          dataType: flow
        - portId: data
          dataType: any
      outputPorts:
        - portId: out
          dataType: flow
        - portId: result
          dataType: string
        - portId: score
          dataType: score
      params: []
    - nodeId: finish
      nodeKind: control.finish
      label: 结束
      category: Control/Finish
      config: {}
      inputPorts:
        - portId: in
          dataType: flow
        - portId: result
          dataType: any
      outputPorts: []
      params: []
  edges:
    # 加载 → 主Agent Plan
    - source: loader-workdir
      target: main-prompt
      sourceHandle: out
      targetHandle: in
    - source: loader-workdir
      target: main-prompt
      sourceHandle: data
      targetHandle: data
      dataEdge: true
    # 主Agent Plan → 子Agent执行
    - source: main-prompt
      target: sub-execute
      sourceHandle: out
      targetHandle: in
    - source: main-prompt
      target: sub-execute
      sourceHandle: result
      targetHandle: prompt
      dataEdge: true
    # 执行 → 评分
    - source: sub-execute
      target: main-evaluate
      sourceHandle: result
      targetHandle: data
      dataEdge: true
    - source: sub-execute
      target: main-evaluate
      sourceHandle: out
      targetHandle: in
    # 评分 → 结束
    - source: main-evaluate
      target: finish
      sourceHandle: result
      targetHandle: result
      dataEdge: true
    - source: main-evaluate
      target: finish
      sourceHandle: out
      targetHandle: in
  startNodeId: loader-workdir
runtime:
  maxConcurrency: 1
  defaultTurnTimeoutMs: 60000
  persistEvents: true
  persistMemorySnapshots: false
layout:
  positions:
    - nodeId: loader-workdir
      x: 50
      y: 200
    - nodeId: main-prompt
      x: 300
      y: 200
    - nodeId: sub-execute
      x: 550
      y: 200
    - nodeId: main-evaluate
      x: 800
      y: 200
    - nodeId: finish
      x: 1050
      y: 200
  nodeBindings:
    - nodeId: main-prompt
      agentId: main-agent
    - nodeId: sub-execute
      agentId: sub-agent
    - nodeId: main-evaluate
      agentId: main-agent
  viewport:
    x: 0
    y: 0
    zoom: 0.8
`;
}