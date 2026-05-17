// @agentsflow/ui-flow
// React Flow canvas, node panel, run event view, agent definition panel, and YAML edit linking.

// Legacy (single-document, monolithic layout)
export { FlowCanvas } from "./components/flow-canvas.js";
export { FlowEditor } from "./components/flow-editor.js";
export { useFlowStore } from "./store/flow-store.js";

// Workbench (VS Code-like layout)
export { Workbench } from "./components/workbench.js";
export { Toolbar } from "./components/toolbar.js";
export { ActivityBar } from "./components/activity-bar.js";
export { ExplorerPane } from "./components/explorer-pane.js";
export { WorkspacePane } from "./components/workspace-pane.js";
export { PreviewPane } from "./components/preview-pane.js";
export { CenterWorkspace } from "./components/center-workspace.js";
export { TabBar } from "./components/tab-bar.js";
export { BottomPreview } from "./components/bottom-preview.js";
export { AssistantPanel } from "./components/assistant-panel.js";
export { FlowEditorSurface } from "./components/flow-editor-surface.js";

// Workbench stores
export { useWorkbenchStore } from "./store/workbench-store.js";
export { useWorkspaceStore } from "./store/workspace-store.js";

// Workbench styling tokens
export * as WorkbenchTokens from "./components/workbench-tokens.js";
