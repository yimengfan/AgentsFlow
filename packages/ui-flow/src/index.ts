// @agentsflow/ui-flow
// React Flow canvas, node panel, run event view, agent definition panel, and YAML edit linking.

// Legacy (single-document, monolithic layout)
export { FlowCanvas } from "./components/flow-canvas.js";
export { FlowEditor } from "./components/flow-editor.js";
export { useFlowStore } from "./store/flow-store.js";

// Node creation context menu
export { NodeContextMenu } from "./components/node-context-menu.js";
export { portColor, PORT_COLORS } from "./components/node-context-menu.js";

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
export { TextFilePreview } from "./components/text-file-preview.js";
export { BinaryPlaceholder } from "./components/binary-placeholder.js";
export { NodeInspector, type YamlRevealTarget } from "./components/node-inspector.js";

// Workbench stores
export { useWorkbenchStore } from "./store/workbench-store.js";
export { useWorkspaceStore, type DocumentType, type DocumentState } from "./store/workspace-store.js";
export { useWorkspaceTreeStore } from "./store/workspace-tree-store.js";
export { useRuntimeStore } from "./store/runtime-store.js";

// Workspace file tree
export { FileTreeItem } from "./components/file-tree-item.js";
export { FileTreeContextMenu } from "./components/file-tree-context-menu.js";
export { WorkspaceDropdown } from "./components/workspace-dropdown.js";
export type { TreeNode } from "./lib/workspace-tree.js";
export {
  buildTreeNode,
  updateNodeInTree,
  sortTreeEntries,
  findNodeInTree,
  getParentPath,
  getBaseName,
} from "./lib/workspace-tree.js";

// Runtime adapter extension point for browser/local preview
export {
  registerRuntimeAdapterExtension,
  unregisterRuntimeAdapterExtension,
  listRuntimeAdapterExtensions,
  resolveRuntimeAdapter,
  type RuntimeAdapterExtension,
  type RuntimeAdapterExtensionContext,
} from "./lib/runtime-adapter-registry.js";

// Workbench styling tokens & theme system
export type { Palette, SemanticTokens, ThemePreset } from "./components/workbench-tokens.js";
export {
  darkOled,
  darkCatppuccinMocha,
  darkOneDark,
  THEME_PRESETS,
  tokens,
  getThemePreset,
  resolveThemeTokens,
} from "./components/workbench-tokens.js";
export * as WorkbenchTokens from "./components/workbench-tokens.js";
