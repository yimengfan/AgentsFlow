/**
 * Workspace tree utility — types and immutable helpers for the file tree.
 *
 * The tree is a flat-friendly recursive structure where each node may
 * have children (for directories) that are loaded lazily on expand.
 */

/** A single node in the workspace file tree. */
export interface TreeNode {
  /** Absolute filesystem path */
  readonly path: string;
  /** Display name (basename) */
  readonly name: string;
  /** Whether this node represents a directory */
  readonly isDirectory: boolean;
  /** Whether this node is a flow file (.yml or .yaml) */
  readonly isFlowFile: boolean;
  /** Child nodes (null = not yet loaded, empty array = loaded but empty) */
  children: TreeNode[] | null;
  /** Whether this directory is currently expanded in the UI */
  isExpanded: boolean;
  /** Whether children are currently being loaded */
  isLoading: boolean;
}

/** Build a TreeNode from a DirEntry (platform API output). */
export function buildTreeNode(
  entry: { readonly name: string; readonly path: string; readonly isDirectory: boolean; readonly isFlowFile: boolean },
): TreeNode {
  return {
    path: entry.path,
    name: entry.name,
    isDirectory: entry.isDirectory,
    isFlowFile: entry.isFlowFile,
    children: entry.isDirectory ? null : [],
    isExpanded: false,
    isLoading: false,
  };
}

/** Immutably update a node at the given path within the tree. */
export function updateNodeInTree(
  tree: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.isDirectory && node.children) {
      const updatedChildren = updateNodeInTree(node.children, targetPath, updater);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
}

/** Sort tree entries: directories first, then alphabetical by name. */
export function sortTreeEntries(entries: TreeNode[]): TreeNode[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Find a node by path in the tree.
 * Returns the node if found, undefined otherwise.
 */
export function findNodeInTree(tree: TreeNode[], targetPath: string): TreeNode | undefined {
  for (const node of tree) {
    if (node.path === targetPath) return node;
    if (node.isDirectory && node.children) {
      const found = findNodeInTree(node.children, targetPath);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Get the parent path for a given path.
 * e.g. "/a/b/c" → "/a/b", "/a" → ""
 */
export function getParentPath(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const lastSep = filePath.lastIndexOf(sep);
  if (lastSep <= 0) return "";
  return filePath.slice(0, lastSep);
}

/**
 * Get the display name (basename) for a path.
 * e.g. "/a/b/c.yml" → "c.yml"
 */
export function getBaseName(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const lastSep = filePath.lastIndexOf(sep);
  return lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
}
