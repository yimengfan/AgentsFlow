import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TreeNode } from "../lib/workspace-tree.js";
import { buildTreeNode, updateNodeInTree } from "../lib/workspace-tree.js";

/**
 * WorkspaceTreeStore — manages the file tree browser state.
 *
 * OWNS: root path, tree nodes, expanded state, recent workspaces list.
 * DOES NOT OWN: document/tab state — that's WorkspaceStore.
 *
 * The store is platform-agnostic; components call platform.workspace
 * directly for data fetching and then update the store.
 */

export interface RecentWorkspace {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: number;
}

export interface WorkspaceTreeState {
  /** Currently opened workspace root path (null = no workspace) */
  rootPath: string | null;
  /** Root-level tree entries */
  tree: readonly TreeNode[];
  /** List of recent workspaces (persisted) */
  recentWorkspaces: readonly RecentWorkspace[];
  /** Whether the tree is currently loading */
  isLoading: boolean;
  /** Error message if tree loading failed */
  error: string | null;
  /** Path of the file currently highlighted in the tree (set by inspector "reveal in explorer") */
  highlightedFilePath: string | null;
}

export interface WorkspaceTreeActions {
  /** Set the workspace root path (opens a workspace) */
  setRootPath: (path: string | null) => void;
  /** Replace the entire tree (after initial load) */
  setTree: (tree: readonly TreeNode[]) => void;
  /** Update a single node in the tree */
  updateNode: (targetPath: string, updater: (node: TreeNode) => TreeNode) => void;
  /** Set children on a directory node (after lazy load) */
  setNodeChildren: (dirPath: string, children: readonly TreeNode[]) => void;
  /** Toggle expand state of a directory */
  toggleExpand: (dirPath: string) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Add a workspace to recent list */
  addRecentWorkspace: (path: string) => void;
  /** Remove a workspace from recent list */
  removeRecentWorkspace: (path: string) => void;
  /** Clear all recent workspaces */
  clearRecentWorkspaces: () => void;
  /** Reset store state (close workspace) */
  closeWorkspace: () => void;
  /** Highlight a file in the tree and expand its parent directories */
  revealFilePath: (filePath: string) => void;
  /** Clear the highlighted file path */
  clearHighlight: () => void;
}

export type WorkspaceTreeStore = WorkspaceTreeState & WorkspaceTreeActions;

const MAX_RECENT_WORKSPACES = 10;

export const useWorkspaceTreeStore = create<WorkspaceTreeStore>()(
  persist(
    (set, get) => ({
      rootPath: null,
      tree: [],
      recentWorkspaces: [],
      isLoading: false,
      error: null,
      highlightedFilePath: null,

      setRootPath: (path) => set({ rootPath: path, tree: [], error: null }),

      setTree: (tree) => set({ tree }),

      updateNode: (targetPath, updater) => {
        const { tree } = get();
        const updated = updateNodeInTree([...tree], targetPath, updater);
        set({ tree: updated });
      },

      setNodeChildren: (dirPath, children) => {
        const { tree } = get();
        const updated = updateNodeInTree([...tree], dirPath, (node) => ({
          ...node,
          children: [...children],
          isLoading: false,
          isExpanded: true,
        }));
        set({ tree: updated });
      },

      toggleExpand: (dirPath) => {
        const { tree } = get();
        const updated = updateNodeInTree([...tree], dirPath, (node) => ({
          ...node,
          isExpanded: !node.isExpanded,
        }));
        set({ tree: updated });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      addRecentWorkspace: (path) => {
        const { recentWorkspaces } = get();
        const name = path.split(/[/\\]/).pop() ?? path;
        const filtered = recentWorkspaces.filter((w) => w.path !== path);
        const updated: readonly RecentWorkspace[] = [
          { path, name, lastOpenedAt: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT_WORKSPACES);
        set({ recentWorkspaces: updated });
      },

      removeRecentWorkspace: (path) => {
        const { recentWorkspaces } = get();
        set({ recentWorkspaces: recentWorkspaces.filter((w) => w.path !== path) });
      },

      clearRecentWorkspaces: () => set({ recentWorkspaces: [] }),

      revealFilePath: (filePath) => {
        const { tree, rootPath } = get();
        if (!rootPath) return;

        // Resolve to absolute path if relative
        const absolutePath = filePath.startsWith("/") ? filePath : `${rootPath}/${filePath}`;

        // Walk up the path, expanding each parent directory
        let currentTree = [...tree] as TreeNode[];
        const parts = absolutePath.slice(rootPath.length + 1).split("/");
        let currentDir = rootPath;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = `${currentDir}/${parts[i]}`;
          const updated = updateNodeInTree(currentTree, currentDir, (node) => ({
            ...node,
            isExpanded: true,
          }));
          currentTree = updated;
        }

        set({ tree: currentTree, highlightedFilePath: absolutePath });
      },

      clearHighlight: () => set({ highlightedFilePath: null }),

      closeWorkspace: () => set({ rootPath: null, tree: [], error: null, highlightedFilePath: null }),
    }),
    {
      name: "agentsflow-workspace-tree",
      // Only persist recentWorkspaces and rootPath
      partialize: (state) => ({
        recentWorkspaces: state.recentWorkspaces,
        rootPath: state.rootPath,
      }),
    },
  ),
);
