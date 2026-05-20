import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script — exposes a typed IPC API to the renderer process.
 *
 * The renderer can only call these whitelisted methods.
 * All communication goes through the contextBridge.
 */
const api = {
  // Flow operations
  flow: {
    list: (): Promise<any[]> => ipcRenderer.invoke("flow:list"),
    load: (filePath: string): Promise<string> => ipcRenderer.invoke("flow:load", filePath),
    save: (filePath: string, yaml: string): Promise<boolean> =>
      ipcRenderer.invoke("flow:save", filePath, yaml),
    validate: (yaml: string): Promise<{ valid: boolean; errors: string[] }> =>
      ipcRenderer.invoke("flow:validate", yaml),
  },

  // Run operations
  run: {
    start: (yaml: string, input?: Record<string, unknown>): Promise<string> =>
      ipcRenderer.invoke("run:start", yaml, input),
    pause: (runId: string): Promise<boolean> => ipcRenderer.invoke("run:pause", runId),
    resume: (runId: string): Promise<boolean> => ipcRenderer.invoke("run:resume", runId),
    abort: (runId: string): Promise<boolean> => ipcRenderer.invoke("run:abort", runId),
    getStatus: (runId: string): Promise<any> => ipcRenderer.invoke("run:getStatus", runId),
  },

  // Agent operations
  agent: {
    listAdapters: (): Promise<any[]> => ipcRenderer.invoke("agent:listAdapters"),
    getAdapter: (kind: string): Promise<any> => ipcRenderer.invoke("agent:getAdapter", kind),
  },

  // Store operations
  store: {
    query: (options: any): Promise<any[]> => ipcRenderer.invoke("store:query", options),
    getRunEvents: (runId: string): Promise<any[]> =>
      ipcRenderer.invoke("store:getRunEvents", runId),
  },

  // Workspace operations
  workspace: {
    openDialog: (): Promise<string | null> => ipcRenderer.invoke("workspace:openDialog"),
    readDir: (dirPath: string): Promise<any[]> => ipcRenderer.invoke("workspace:readDir", dirPath),
    createFile: (filePath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke("workspace:createFile", filePath, content),
    stat: (path: string): Promise<any | null> => ipcRenderer.invoke("workspace:stat", path),
    readFile: (path: string): Promise<any | null> => ipcRenderer.invoke("workspace:readFile", path),
  },

  // Event subscription
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const listener = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld("agentsflow", api);
