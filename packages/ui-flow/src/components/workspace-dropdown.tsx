import { useState, useCallback, useRef, useEffect } from "react";
import { useWorkspaceTreeStore } from "../store/workspace-tree-store.js";
import { usePlatform } from "@agentsflow/platform-adapter";
import { buildTreeNode } from "../lib/workspace-tree.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";

/**
 * WorkspaceDropdown — replaces the "＋ New" button in the toolbar.
 *
 * Shows:
 * - Current workspace name (or "Open Workspace" if none)
 * - Dropdown with:
 *   - "Open Folder" button
 *   - Recent workspaces list (last 10, clickable to switch)
 *   - "New Flow" action (creates in current workspace root)
 */

export function WorkspaceDropdown() {
  const platform = usePlatform();
  const rootPath = useWorkspaceTreeStore((s) => s.rootPath);
  const recentWorkspaces = useWorkspaceTreeStore((s) => s.recentWorkspaces);
  const setRootPath = useWorkspaceTreeStore((s) => s.setRootPath);
  const setTree = useWorkspaceTreeStore((s) => s.setTree);
  const setLoading = useWorkspaceTreeStore((s) => s.setLoading);
  const setError = useWorkspaceTreeStore((s) => s.setError);
  const addRecentWorkspace = useWorkspaceTreeStore((s) => s.addRecentWorkspace);
  const removeRecentWorkspace = useWorkspaceTreeStore((s) => s.removeRecentWorkspace);

  const [isOpen, setIsOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleOpenWorkspace = useCallback(async () => {
    setIsOpen(false);
    try {
      const selectedPath = await platform.workspace.openDialog();
      if (selectedPath) {
        setRootPath(selectedPath);
        addRecentWorkspace(selectedPath);
        setLoading(true);
        setError(null);
        const entries = await platform.workspace.readDir(selectedPath);
        const nodes = entries.map((entry) =>
          buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
        );
        setTree(nodes);
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to open workspace:", err);
      setError(String(err));
      setLoading(false);
    }
  }, [platform, setRootPath, addRecentWorkspace, setTree, setLoading, setError]);

  const handleOpenFromPath = useCallback(async () => {
    const trimmed = pathInput.trim();
    if (!trimmed) return;
    setPathError(null);
    try {
      // Verify the path exists and is a directory
      const stat = await platform.workspace.stat(trimmed);
      if (!stat?.isDirectory) {
        setPathError("Not a directory or path does not exist");
        return;
      }
      setIsOpen(false);
      setPathInput("");
      setRootPath(trimmed);
      addRecentWorkspace(trimmed);
      setLoading(true);
      setError(null);
      const entries = await platform.workspace.readDir(trimmed);
      const nodes = entries.map((entry) =>
        buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
      );
      setTree(nodes);
      setLoading(false);
    } catch (err) {
      console.error("Failed to open workspace from path:", err);
      setPathError("Failed to open path");
    }
  }, [pathInput, platform, setRootPath, addRecentWorkspace, setTree, setLoading, setError]);

  const handleSwitchWorkspace = useCallback(
    async (path: string) => {
      setIsOpen(false);
      setRootPath(path);
      addRecentWorkspace(path);
      setLoading(true);
      setError(null);
      try {
        const entries = await platform.workspace.readDir(path);
        const nodes = entries.map((entry) =>
          buildTreeNode(entry as { name: string; path: string; isDirectory: boolean; isFlowFile: boolean }),
        );
        setTree(nodes);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load workspace:", path, err);
        setError(String(err));
        setLoading(false);
      }
    },
    [platform, setRootPath, addRecentWorkspace, setTree, setLoading, setError],
  );

  const handleRemoveRecent = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentWorkspace(path);
    },
    [removeRecentWorkspace],
  );

  const workspaceName = rootPath ? rootPath.split(/[/\\]/).pop() ?? rootPath : null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          cursor: "pointer",
          background: isOpen ? BUTTON.hoverBg : "transparent",
          border: "1px solid transparent",
          borderRadius: BUTTON.borderRadius,
          color: isOpen ? TEXT.primary : TEXT.secondary,
          padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
          fontSize: TYPO.smallFontSize,
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: `background-color ${BUTTON.transitionMs}ms ease, color ${BUTTON.transitionMs}ms ease`,
          minHeight: BUTTON.height,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLButtonElement).style.background = BUTTON.hoverBg;
            (e.currentTarget as HTMLButtonElement).style.color = BUTTON.textHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = TEXT.secondary;
          }
        }}
        title={rootPath ?? "Open Workspace"}
      >
        <span>📂</span>
        <span>{workspaceName ?? "Open"}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth: 220,
            background: SURFACE.panel,
            border: `1px solid ${BORDER.default}`,
            borderRadius: BUTTON.borderRadius,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            zIndex: 10001,
            padding: `${SPACING.xs}px 0`,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {/* Open Folder button */}
          <button
            onClick={handleOpenWorkspace}
            style={{
              display: "block",
              width: "100%",
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              background: "transparent",
              border: "none",
              color: ACCENT.indigo,
              cursor: "pointer",
              textAlign: "left",
              fontSize: TYPO.fontSize,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = SURFACE.hover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            📂 Open Folder...
          </button>

          {/* Path input (for web mode or manual entry) */}
          <div style={{ padding: `${SPACING.xs}px ${SPACING.md}px` }}>
            <div style={{ display: "flex", gap: SPACING.xs }}>
              <input
                ref={pathInputRef}
                type="text"
                value={pathInput}
                onChange={(e) => { setPathInput(e.target.value); setPathError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleOpenFromPath(); }}
                placeholder="Or type a path..."
                style={{
                  flex: 1,
                  background: SURFACE.input,
                  border: `1px solid ${pathError ? ACCENT.errorRed : BORDER.default}`,
                  borderRadius: BUTTON.borderRadius,
                  color: TEXT.primary,
                  padding: `${SPACING.xs}px ${SPACING.sm}px`,
                  fontSize: TYPO.smallFontSize,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleOpenFromPath}
                disabled={!pathInput.trim()}
                style={{
                  background: pathInput.trim() ? ACCENT.indigo : SURFACE.input,
                  color: pathInput.trim() ? "#fff" : TEXT.muted,
                  border: "none",
                  borderRadius: BUTTON.borderRadius,
                  padding: `${SPACING.xs}px ${SPACING.sm}px`,
                  cursor: pathInput.trim() ? "pointer" : "default",
                  fontSize: TYPO.smallFontSize,
                  fontWeight: 500,
                }}
              >
                Go
              </button>
            </div>
            {pathError && (
              <div style={{ fontSize: TYPO.smallFontSize - 1, color: ACCENT.errorRed, marginTop: 2 }}>
                {pathError}
              </div>
            )}
          </div>

          {/* Recent workspaces */}
          {recentWorkspaces.length > 0 && (
            <>
              <div
                style={{
                  padding: `${SPACING.xs}px ${SPACING.md}px`,
                  fontSize: TYPO.smallFontSize,
                  color: TEXT.muted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginTop: SPACING.xs,
                }}
              >
                Recent
              </div>
              {recentWorkspaces.map((ws) => {
                const isCurrent = ws.path === rootPath;
                return (
                  <div
                    key={ws.path}
                    onClick={() => handleSwitchWorkspace(ws.path)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: `${SPACING.xs}px ${SPACING.md}px`,
                      background: isCurrent ? SURFACE.hover : "transparent",
                      cursor: isCurrent ? "default" : "pointer",
                      color: isCurrent ? TEXT.primary : TEXT.secondary,
                      fontSize: TYPO.fontSize,
                      transition: `background-color ${BUTTON.transitionMs}ms ease`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) {
                        (e.currentTarget as HTMLDivElement).style.background = SURFACE.hover;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ws.name}
                    </span>
                    {!isCurrent && (
                      <button
                        onClick={(e) => handleRemoveRecent(e, ws.path)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: TEXT.muted,
                          cursor: "pointer",
                          fontSize: 12,
                          padding: "0 2px",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        title="Remove from recent"
                      >
                        ✕
                      </button>
                    )}
                    {isCurrent && (
                      <span style={{ fontSize: 10, color: ACCENT.indigo, flexShrink: 0 }}>●</span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
