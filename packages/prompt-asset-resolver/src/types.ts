/**
 * Platform abstraction for file system access.
 *
 * In the browser/desktop app this is backed by `WorkspaceApi` from
 * `@agentsflow/platform-adapter`.  For testing or CLI usage a simple
 * `fs`-backed implementation can be provided.
 */
export interface ScannerFs {
  /** List entries in a directory (single level). Returns entry names. */
  readDir(path: string): Promise<readonly string[]>;
  /** Read the full text content of a file. */
  readFile(path: string): Promise<string>;
  /** Check if a path exists and return its type. */
  stat(path: string): Promise<{ type: "file" | "directory" } | undefined>;
}
