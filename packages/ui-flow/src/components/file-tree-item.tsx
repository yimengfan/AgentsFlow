import { useCallback } from "react";
import type { TreeNode } from "../lib/workspace-tree.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { buildTreeNode } from "../lib/workspace-tree.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT } from "./workbench-tokens.js";

/**
 * Check if YAML content represents a valid AgentsFlow definition.
 *
 * A file is considered a flow if it has:
 * - An explicit `agentsflow: true` marker at the top level, OR
 * - A valid `meta.schemaVersion` field (implicit marker)
 */
function isFlowYaml(yamlContent: string): boolean {
  // Quick check for explicit marker
  if (/^agentsflow:\s*true\b/m.test(yamlContent)) return true;
  // Check for meta.schemaVersion (implicit flow marker)
  if (/^meta:\s*\n(\s+.*\n)*\s+schemaVersion:/m.test(yamlContent)) return true;
  // Also handle inline meta: { schemaVersion: ... }
  if (/^meta:\s*\{[^}]*schemaVersion/m.test(yamlContent)) return true;
  return false;
}

/**
 * Check if a file extension suggests it's a text-based file.
 */
function isTextExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const textExtensions = new Set([
    "txt", "md", "markdown", "json", "yaml", "yml", "toml", "ini", "cfg", "conf",
    "js", "jsx", "ts", "tsx", "mjs", "cjs",
    "py", "rb", "rs", "go", "java", "kt", "swift", "c", "cpp", "h", "hpp",
    "sh", "bash", "zsh", "fish",
    "html", "htm", "css", "scss", "less", "svg", "xml",
    "sql", "graphql", "gql",
    "dockerfile", "gitignore", "env", "editorconfig",
    "log", "csv", "tsv",
  ]);
  return textExtensions.has(ext);
}

/**
 * FileTreeItem — a single row in the workspace file tree.
 *
 * Renders a folder (expandable, lazy-loads children) or file (clickable, opens in editor).
 * Right-click shows a context menu.
 */

interface FileTreeItemProps {
  node: TreeNode;
  /** Nesting depth (0 = root level) */
  depth: number;
  /** Callback for right-click context menu */
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
}

export function FileTreeItem({ node, depth, onContextMenu }: FileTreeItemProps) {
  const platform = usePlatform();
  const openFlow = useWorkspaceStore((s) => s.openFlow);
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const setNodeChildren = useWorkspaceTreeStore((s) => s.setNodeChildren);
  const toggleExpand = useWorkspaceTreeStore((s) => s.toggleExpand);
  const updateNode = useWorkspaceTreeStore((s) => s.updateNode);

  const isActive = !node.isDirectory && node.path === activeFlowPath;
  const isExpanded = node.isDirectory && node.isExpanded;
  const isLoading = node.isDirectory && node.isLoading;

  const handleDirectoryToggle = useCallback(async () => {
    if (!node.isDirectory) return;

    if (node.children !== null) {
      toggleExpand(node.path);
      return;
    }

    // Mark as loading
    updateNode(node.path, (n) => ({ ...n, isLoading: true }));

    try {
      const entries = await platform.workspace.readDir(node.path);
      const children = entries.map((entry) =>
        buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
      );
      setNodeChildren(node.path, children);
    } catch (err) {
      console.error("Failed to read directory:", node.path, err);
      updateNode(node.path, (n) => ({ ...n, isLoading: false }));
    }
  }, [node, platform, toggleExpand, updateNode, setNodeChildren]);

  const handleFileClick = useCallback(async () => {
    if (node.isDirectory) return;

    // For .yml/.yaml files, read the content first and check if it's a flow
    if (node.isFlowFile) {
      try {
        const result = await platform.workspace.readFile(node.path);
        if (!result) {
          console.error("Failed to read YAML file:", node.path);
          return;
        }
        const content = result.content;
        // Check if this is actually a flow YAML (has agentsflow marker or meta.schemaVersion)
        if (isFlowYaml(content)) {
          openFlow(node.path, content);
          return;
        }
        // It's a YAML file but not a flow — open as text
        const openFile = useWorkspaceStore.getState().openFile;
        openFile(node.path, content, "text");
        return;
      } catch (err) {
        console.error("Failed to read YAML file:", node.path, err);
        return;
      }
    }

    // For non-YAML files, use readFile to get content and detect binary
    try {
      const result = await platform.workspace.readFile(node.path);
      if (!result) {
        console.error("Failed to read file:", node.path);
        return;
      }
      const openFile = useWorkspaceStore.getState().openFile;
      if (result.isBinary) {
        openFile(node.path, "", "binary");
      } else {
        openFile(node.path, result.content, "text");
      }
    } catch (err) {
      console.error("Failed to read file:", node.path, err);
    }
  }, [node, platform, openFlow]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, node);
    },
    [onContextMenu, node],
  );

  return (
    <div>
      <div
        onClick={node.isDirectory ? handleDirectoryToggle : handleFileClick}
        onContextMenu={handleContextMenu}
        style={{
          display: "flex",
          alignItems: "center",
          height: 22,
          paddingLeft: depth * 16 + 4,
          paddingRight: SPACING.sm,
          background: isActive ? ACCENT.indigo + "26" : "transparent",
          borderLeft: isActive ? `2px solid ${BORDER.active}` : "2px solid transparent",
          color: isActive ? TEXT.primary : node.isFlowFile ? ACCENT.indigo : TEXT.secondary,
          cursor: "pointer",
          fontSize: TYPO.fontSize,
          userSelect: "none",
          transition: "background-color 80ms ease",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLDivElement).style.background = SURFACE.hover;
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
          }
        }}
      >
        {/* Expand/collapse chevron */}
        <span
          style={{
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 10,
            color: TEXT.muted,
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 100ms ease",
          }}
        >
          {node.isDirectory ? "▶" : ""}
        </span>

        {/* Icon */}
        <span
          style={{
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginRight: 4,
            fontSize: 12,
          }}
        >
          {node.isDirectory
            ? isExpanded
              ? "📂"
              : "📁"
            : node.isFlowFile
              ? "🔷"
              : "📄"}
        </span>

        {/* Name */}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {node.name}
        </span>

        {/* Loading indicator */}
        {isLoading && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: TEXT.muted }}>
            ...
          </span>
        )}
      </div>

      {/* Children (rendered when directory is expanded and children are loaded) */}
      {isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
