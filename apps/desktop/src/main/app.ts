import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlowScheduler, type AdapterResolver } from "@agentsflow/flow-engine";
import { DefaultAgentRegistry } from "@agentsflow/agent-registry";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";
import { LocalStore, type SqlExecutor } from "@agentsflow/local-store";
import type { IpcChannelMap } from "@agentsflow/shared-contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * createApp — bootstraps the Electron desktop application.
 *
 * Initializes:
 *   - Agent registry with adapter factories
 *   - Flow scheduler for run orchestration
 *   - Local store for persistence
 *   - IPC handlers for renderer communication
 *   - Browser window with React renderer
 */
export async function createApp(options?: { db?: SqlExecutor }): Promise<void> {
  // 1. Initialize agent registry
  const registry = new DefaultAgentRegistry();

  // Register the FakeAgentAdapter for demo/testing
  registry.registerAdapter(
    {
      adapterKind: "fake",
      displayName: "Fake Agent Adapter",
      adapterVersion: "0.1.0",
      contractVersion: "0.1.0",
      supportedCapabilities: [
        "streaming",
        "structured-output",
        "tool-calls",
        "delegation-proposal",
        "interrupt-resume",
        "multi-turn-session",
      ],
      limitations: ["Not a real agent — returns canned responses only"],
    },
    () => new FakeAgentAdapter(),
  );

  // 2. Initialize flow scheduler with adapter resolver
  const adapterResolver: AdapterResolver = (kind) => registry.getAdapter(kind);
  const scheduler = new FlowScheduler(adapterResolver);

  // 3. Initialize local store (if DB provided)
  let store: LocalStore | undefined;
  if (options?.db) {
    store = new LocalStore(options.db);
    store.initialize();
  }

  // 4. Subscribe scheduler events to store
  if (store) {
    scheduler.events.on("*", (event) => {
      store!.appendEvent(event);
    });
  }

  // 5. Register IPC handlers
  registerIpcHandlers(scheduler, registry, store);

  // 6. Create the browser window when Electron is ready
  await app.whenReady();
  createWindow();

  app.on("window-all-closed", () => {
    app.quit();
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AgentsFlow Studio",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // In dev mode, load from Vite dev server; in production, load built files
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "renderer", "index.html"));
  }

  return win;
}

/**
 * Register typed IPC handlers for the main process.
 */
function registerIpcHandlers(
  scheduler: FlowScheduler,
  registry: DefaultAgentRegistry,
  store?: LocalStore,
): void {
  // Flow operations
  ipcMain.handle("flow:list", async () => {
    // TODO: scan flow directory for .yaml files
    return [];
  });

  ipcMain.handle("flow:load", async (_e: IpcMainInvokeEvent, filePath: string) => {
    const fs = await import("node:fs/promises");
    const yaml = await fs.readFile(filePath, "utf-8");
    return yaml;
  });

  ipcMain.handle("flow:save", async (_e: IpcMainInvokeEvent, filePath: string, yaml: string) => {
    const fs = await import("node:fs/promises");
    await fs.writeFile(filePath, yaml, "utf-8");
    return true;
  });

  ipcMain.handle("flow:validate", async (_e: IpcMainInvokeEvent, yaml: string) => {
    const { parseFlowYaml, safeValidateFlowDefinition } = await import("@agentsflow/flow-schema");
    try {
      const flow = parseFlowYaml(yaml);
      const result = safeValidateFlowDefinition(flow);
      if (result.success) {
        return { valid: true, errors: [] as string[] };
      }
      return { valid: false, errors: result.error.errors.map((e) => e.message) };
    } catch (err) {
      return { valid: false, errors: [String(err)] };
    }
  });

  // Run operations
  ipcMain.handle("run:start", async (_e: IpcMainInvokeEvent, yaml: string, input?: Record<string, unknown>) => {
    const { parseFlowYaml } = await import("@agentsflow/flow-schema");
    const flow = parseFlowYaml(yaml);
    const runId = await scheduler.startRun(flow, input);
    return runId;
  });

  ipcMain.handle("run:pause", async (_e: IpcMainInvokeEvent, runId: string) => {
    scheduler.pauseRun(runId);
    return true;
  });

  ipcMain.handle("run:resume", async (_e: IpcMainInvokeEvent, runId: string) => {
    scheduler.resumeRun(runId);
    return true;
  });

  ipcMain.handle("run:abort", async (_e: IpcMainInvokeEvent, runId: string) => {
    scheduler.abortRun(runId);
    return true;
  });

  ipcMain.handle("run:getStatus", async (_e: IpcMainInvokeEvent, runId: string) => {
    const ctx = scheduler.getRunState(runId);
    if (!ctx) return null;
    return {
      runId: ctx.runId,
      state: ctx.state,
      currentNodeId: ctx.currentNodeId,
      iteration: ctx.iteration,
      startedAt: ctx.startedAt,
      completedAt: ctx.completedAt,
      eventCount: ctx.events.length,
    };
  });

  // Agent operations
  ipcMain.handle("agent:listAdapters", async () => {
    return registry.listAdapters();
  });

  ipcMain.handle("agent:getAdapter", async (_e: IpcMainInvokeEvent, kind: string) => {
    const adapter = await registry.getAdapter(kind);
    return adapter?.metadata ?? null;
  });

  // Store operations
  ipcMain.handle("store:query", async (_e: IpcMainInvokeEvent, options: any) => {
    return store?.queryEvents(options) ?? [];
  });

  ipcMain.handle("store:getRunEvents", async (_e: IpcMainInvokeEvent, runId: string) => {
    return store?.queryEvents({ runId }) ?? [];
  });

  // Workspace operations
  ipcMain.handle("workspace:openDialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "打开工作区",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle("workspace:readDir", async (_e: IpcMainInvokeEvent, dirPath: string) => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((entry) => !entry.name.startsWith(".")) // hide dotfiles
        .map((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const isFlowFile = !entry.isDirectory() && /\.(yml|yaml)$/.test(entry.name);
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFlowFile,
          };
        })
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  ipcMain.handle("workspace:createFile", async (_e: IpcMainInvokeEvent, filePath: string, content: string) => {
    const fs = await import("node:fs/promises");
    await fs.writeFile(filePath, content, "utf-8");
    return true;
  });

  ipcMain.handle("workspace:stat", async (_e: IpcMainInvokeEvent, targetPath: string) => {
    const fs = await import("node:fs/promises");
    try {
      const stat = await fs.stat(targetPath);
      return {
        path: targetPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("workspace:readFile", async (_e: IpcMainInvokeEvent, targetPath: string) => {
    const fs = await import("node:fs/promises");
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) return null;
      // Read as buffer to detect binary content
      const buf = await fs.readFile(targetPath);
      // Simple binary detection: check for null bytes in first 8KB
      const checkLen = Math.min(buf.length, 8192);
      let isBinary = false;
      for (let i = 0; i < checkLen; i++) {
        if (buf[i] === 0) { isBinary = true; break; }
      }
      return {
        content: isBinary ? "" : buf.toString("utf-8"),
        isBinary,
      };
    } catch {
      return null;
    }
  });
}
