import { useState, useCallback, useEffect, useRef } from "react";
import type { TreeNode } from "../lib/workspace-tree.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { buildTreeNode } from "../lib/workspace-tree.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT } from "./workbench-tokens.js";

/**
 * FileTreeContextMenu — right-click context menu for the file tree.
 *
 * Provides:
 * - "New Flow" (on directories) — creates a new flow.yml file
 * - "Open in Editor" (on flow files) — opens the file
 * - "Refresh" (on directories) — reloads children
 * - "Copy Path" — copies the node path to clipboard
 */

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

interface FileTreeContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export function FileTreeContextMenu({ state, onClose }: FileTreeContextMenuProps) {
  const platform = usePlatform();
  const createFlowInWorkspace = useWorkspaceStore((s) => s.createFlowInWorkspace);
  const setNodeChildren = useWorkspaceTreeStore((s) => s.setNodeChildren);
  const updateNode = useWorkspaceTreeStore((s) => s.updateNode);
  const [isCreating, setIsCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!state.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.visible, onClose]);

  const handleNewFlow = useCallback(async () => {
    if (!state.node?.isDirectory) return;
    setIsCreating(true);

    try {
      const dirName = state.node.name || "flow";
      const fileName = `${dirName}-flow.yml`;
      await createFlowInWorkspace(state.node.path, fileName, platform);

      // Refresh the directory to show the new file
      const entries = await platform.workspace.readDir(state.node.path);
      const children = entries.map((entry) =>
        buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
      );
      setNodeChildren(state.node.path, children);
    } catch (err) {
      console.error("Failed to create flow:", err);
    } finally {
      setIsCreating(false);
      onClose();
    }
  }, [state.node, createFlowInWorkspace, platform, setNodeChildren, onClose]);

  const handleRefresh = useCallback(async () => {
    if (!state.node?.isDirectory) return;

    updateNode(state.node.path, (n) => ({ ...n, isLoading: true }));
    try {
      const entries = await platform.workspace.readDir(state.node.path);
      const children = entries.map((entry) =>
        buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
      );
      setNodeChildren(state.node.path, children);
    } catch (err) {
      console.error("Failed to refresh directory:", state.node.path, err);
      updateNode(state.node.path, (n) => ({ ...n, isLoading: false }));
    }
    onClose();
  }, [state.node, platform, updateNode, setNodeChildren, onClose]);

  const handleCopyPath = useCallback(() => {
    if (!state.node) return;
    navigator.clipboard.writeText(state.node.path).catch(console.error);
    onClose();
  }, [state.node, onClose]);

  if (!state.visible || !state.node) return null;

  const node = state.node;

  // Compute menu position (ensure it stays within viewport)
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: state.x,
    top: state.y,
    zIndex: 10000,
    minWidth: 160,
    background: SURFACE.panel,
    border: `1px solid ${BORDER.default}`,
    borderRadius: 4,
    padding: `${SPACING.xs}px 0`,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  };

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: `${SPACING.xs}px ${SPACING.md}px`,
    background: "transparent",
    border: "none",
    color: TEXT.primary,
    cursor: "pointer",
    textAlign: "left",
    fontSize: TYPO.fontSize,
    transition: "background-color 80ms ease",
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      {node.isDirectory && (
        <button
          style={itemStyle}
          onClick={handleNewFlow}
          disabled={isCreating}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE.hover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          {isCreating ? "Creating..." : "＋ New Flow"}
        </button>
      )}

      {node.isDirectory && (
        <button
          style={itemStyle}
          onClick={handleRefresh}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE.hover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          ↻ Refresh
        </button>
      )}

      <button
        style={itemStyle}
        onClick={handleCopyPath}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE.hover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        📋 Copy Path
      </button>
    </div>
  );
}
