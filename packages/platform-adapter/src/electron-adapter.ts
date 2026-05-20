import type { PlatformApi } from "./platform-api.js";

/**
 * Electron adapter — delegates to window.agentsflow IPC bridge.
 *
 * In Electron, the preload script exposes `window.agentsflow` via
 * contextBridge. This adapter wraps those calls into the PlatformApi shape.
 */

interface ElectronIpcBridge {
  flow: {
    list: () => Promise<any[]>;
    load: (filePath: string) => Promise<string>;
    save: (filePath: string, yaml: string) => Promise<boolean>;
    validate: (yaml: string) => Promise<{ valid: boolean; errors: string[] }>;
  };
  run: {
    start: (yaml: string, input?: Record<string, unknown>) => Promise<string>;
    pause: (runId: string) => Promise<boolean>;
    resume: (runId: string) => Promise<boolean>;
    abort: (runId: string) => Promise<boolean>;
    getStatus: (runId: string) => Promise<any>;
  };
  agent: {
    listAdapters: () => Promise<any[]>;
    getAdapter: (kind: string) => Promise<any>;
  };
  store: {
    query: (options: any) => Promise<any[]>;
    getRunEvents: (runId: string) => Promise<any[]>;
  };
  workspace: {
    openDialog: () => Promise<string | null>;
    readDir: (dirPath: string) => Promise<any[]>;
    createFile: (filePath: string, content: string) => Promise<boolean>;
    stat: (path: string) => Promise<any | null>;
    readFile: (path: string) => Promise<any | null>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

export function createElectronAdapter(): PlatformApi {
  const ipc = (window as any).agentsflow as ElectronIpcBridge;

  return {
    platform: "electron",

    flow: {
      list: () => ipc.flow.list(),
      load: (flowPath) => ipc.flow.load(flowPath),
      save: (flowPath, content) => ipc.flow.save(flowPath, content).then(() => {}),
      validate: (content) => ipc.flow.validate(content),
    },

    run: {
      start: (flowPath, input) => ipc.run.start(flowPath, input).then((runId) => ({ runId })),
      pause: (runId) => ipc.run.pause(runId).then(() => {}),
      resume: (runId) => ipc.run.resume(runId).then(() => {}),
      abort: (runId) => ipc.run.abort(runId).then(() => {}),
      getStatus: (runId) => ipc.run.getStatus(runId),
    },

    agent: {
      listAdapters: () => ipc.agent.listAdapters(),
      getAdapter: (adapterKind) => ipc.agent.getAdapter(adapterKind),
    },

    store: {
      query: (query, params) => ipc.store.query({ query, params }),
      getRunEvents: (runId, limit) => ipc.store.getRunEvents(runId),
    },

    workspace: {
      openDialog: () => ipc.workspace.openDialog(),
      readDir: (dirPath) => ipc.workspace.readDir(dirPath),
      createFile: (filePath, content) => ipc.workspace.createFile(filePath, content).then(() => {}),
      stat: (path) => ipc.workspace.stat(path),
      readFile: (path) => ipc.workspace.readFile(path),
    },

    on: (channel, callback) => ipc.on(channel, callback),
  };
}