import { useWorkspaceStore } from "../store/workspace-store.js";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { useEffect, useCallback, useState } from "react";
import { buildTreeNode } from "../lib/workspace-tree.js";
import type { TreeNode } from "../lib/workspace-tree.js";
import { FileTreeItem } from "./file-tree-item.js";
import { FileTreeContextMenu } from "./file-tree-context-menu.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";

/**
 * ExplorerPane — file/directory browser in the left sidebar.
 *
 * Shows a tree view of the current workspace directory.
 * Clicking a flow file opens it in the center editor.
 * Right-clicking shows a context menu with "New Flow", "Refresh", "Copy Path".
 *
 * If no workspace is open, shows a prompt to open one.
 */

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

const INITIAL_CONTEXT_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  node: null,
};

export function ExplorerPane() {
  const platform = usePlatform();
  const rootPath = useWorkspaceTreeStore((s) => s.rootPath);
  const tree = useWorkspaceTreeStore((s) => s.tree);
  const isLoading = useWorkspaceTreeStore((s) => s.isLoading);
  const error = useWorkspaceTreeStore((s) => s.error);
  const setRootPath = useWorkspaceTreeStore((s) => s.setRootPath);
  const setTree = useWorkspaceTreeStore((s) => s.setTree);
  const setLoading = useWorkspaceTreeStore((s) => s.setLoading);
  const setError = useWorkspaceTreeStore((s) => s.setError);
  const addRecentWorkspace = useWorkspaceTreeStore((s) => s.addRecentWorkspace);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);

  // Load root directory contents when workspace is opened
  useEffect(() => {
    if (!rootPath) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const entries = await platform.workspace.readDir(rootPath);
        if (!cancelled) {
          const nodes = entries.map((entry) =>
            buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
          );
          setTree(nodes);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [rootPath, platform, setTree, setLoading, setError]);

  const handleOpenWorkspace = useCallback(async () => {
    try {
      const selectedPath = await platform.workspace.openDialog();
      if (selectedPath) {
        setRootPath(selectedPath);
        addRecentWorkspace(selectedPath);
      }
    } catch (err) {
      console.error("Failed to open workspace dialog:", err);
    }
  }, [platform, setRootPath, addRecentWorkspace]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(INITIAL_CONTEXT_MENU);
  }, []);

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          fontWeight: 600,
          color: TEXT.secondary,
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Explorer</span>
        {rootPath && (
          <button
            onClick={handleOpenWorkspace}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT.muted,
              cursor: "pointer",
              fontSize: 14,
              padding: "0 2px",
              lineHeight: 1,
            }}
            title="Open another workspace"
          >
            📂
          </button>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: `${SPACING.xs}px 0`,
        }}
      >
        {!rootPath ? (
          // No workspace open — show prompt
          <div
            style={{
              padding: SPACING.md,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            <div
              style={{
                color: TEXT.muted,
                fontSize: TYPO.fontSize,
                textAlign: "center",
                marginBottom: SPACING.sm,
              }}
            >
              No workspace open
            </div>
            <button
              onClick={handleOpenWorkspace}
              style={{
                background: ACCENT.indigo,
                color: "#fff",
                border: "none",
                borderRadius: BUTTON.borderRadius,
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                cursor: "pointer",
                fontSize: TYPO.fontSize,
                fontWeight: 500,
                transition: `background-color ${BUTTON.transitionMs}ms ease`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = BUTTON.primaryHoverBg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = ACCENT.indigo;
              }}
            >
              Open Folder
            </button>
          </div>
        ) : error ? (
          // Error state
          <div
            style={{
              padding: SPACING.md,
              color: ACCENT.errorRed,
              fontSize: TYPO.fontSize,
              textAlign: "center",
            }}
          >
            Error: {error}
          </div>
        ) : isLoading ? (
          // Loading state
          <div
            style={{
              padding: SPACING.md,
              color: TEXT.muted,
              fontSize: TYPO.fontSize,
              textAlign: "center",
            }}
          >
            Loading...
          </div>
        ) : (
          // File tree
          tree.map((node) => (
            <FileTreeItem
              key={node.path}
              node={node}
              depth={0}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      <FileTreeContextMenu state={contextMenu} onClose={handleCloseContextMenu} />
    </div>
  );
}