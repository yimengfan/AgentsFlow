import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { parseFlowYaml, safeValidateFlowDefinition } from "@agentsflow/flow-schema";

/**
 * Vite plugin that provides workspace REST API endpoints in dev mode.
 * This enables the web app to browse local files when running via `pnpm dev:web`.
 */
function workspaceApiPlugin(): Plugin {
  return {
    name: "workspace-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";

        // POST /api/workspace/open-dialog — in web mode, returns home directory as default
        if (url === "/api/workspace/open-dialog" && req.method === "POST") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(os.homedir()));
          return;
        }

        // GET /api/workspace/suggest-paths — returns common directories for web mode
        if (url.startsWith("/api/workspace/suggest-paths") && req.method === "GET") {
          const home = os.homedir();
          const suggestions = [
            { name: "Home", path: home },
            { name: "Desktop", path: path.join(home, "Desktop") },
            { name: "Documents", path: path.join(home, "Documents") },
            { name: "Downloads", path: path.join(home, "Downloads") },
          ];
          // Filter to only existing directories
          const existing = [];
          for (const s of suggestions) {
            try {
              const stat = await fs.stat(s.path);
              if (stat.isDirectory()) existing.push(s);
            } catch { /* skip */ }
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(existing));
          return;
        }

        // GET /api/workspace/read-dir?path=...
        if (url.startsWith("/api/workspace/read-dir") && req.method === "GET") {
          try {
            const dirPath = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path") ?? "");
            if (!dirPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "path parameter required" }));
              return;
            }
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const result = entries
              .filter((entry) => {
                // Only hide .git and node_modules; show all other dot entries
                if (entry.name === ".git" || entry.name === "node_modules") return false;
                return true;
              })
              .map((entry) => {
                const fullPath = path.join(dirPath, entry.name);
                const isFlowFile = !entry.isDirectory() && /\.(yml|yaml)$/.test(entry.name);
                return {
                  name: entry.name,
                  path: fullPath,
                  isDirectory: entry.isDirectory(),
                  isFlowFile,
                  isHidden: entry.name.startsWith("."),
                };
              })
              .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
              });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify([]));
          }
          return;
        }

        // POST /api/workspace/create-file
        if (url === "/api/workspace/create-file" && req.method === "POST") {
          try {
            const body = await new Promise<string>((resolve) => {
              let data = "";
              req.on("data", (chunk) => { data += chunk; });
              req.on("end", () => { resolve(data); });
            });
            const { filePath, content } = JSON.parse(body) as { filePath: string; content: string };
            await fs.writeFile(filePath, content, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // GET /api/workspace/stat?path=...
        if (url.startsWith("/api/workspace/stat") && req.method === "GET") {
          try {
            const targetPath = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path") ?? "");
            if (!targetPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "path parameter required" }));
              return;
            }
            const stat = await fs.stat(targetPath);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              path: targetPath,
              isDirectory: stat.isDirectory(),
              size: stat.size,
              modifiedAt: stat.mtimeMs,
            }));
          } catch {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(null));
          }
          return;
        }

        // GET /api/workspace/read-file?path=...
        if (url.startsWith("/api/workspace/read-file") && req.method === "GET") {
          try {
            const targetPath = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path") ?? "");
            if (!targetPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "path parameter required" }));
              return;
            }
            const stat = await fs.stat(targetPath);
            if (stat.isDirectory()) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(null));
              return;
            }
            // Read as buffer to detect binary content
            const buf = await fs.readFile(targetPath);
            // Simple binary detection: check for null bytes in first 8KB
            const checkLen = Math.min(buf.length, 8192);
            let isBinary = false;
            for (let i = 0; i < checkLen; i++) {
              if (buf[i] === 0) { isBinary = true; break; }
            }
            // For large text files, truncate to 512KB for preview
            let content = "";
            if (!isBinary) {
              content = buf.toString("utf-8");
              if (content.length > 512 * 1024) {
                content = content.slice(0, 512 * 1024) + "\n\n... (file truncated for preview)";
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ content, isBinary }));
          } catch {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(null));
          }
          return;
        }

        // GET /api/flows/:flowPath — load a single flow YAML by its full path
        // Must be matched BEFORE the /api/flows?workspacePath=... list route
        if (url.startsWith("/api/flows/") && req.method === "GET") {
          try {
            // Extract the encoded flow path from URL: /api/flows/{encodedPath}
            const encodedPath = url.slice("/api/flows/".length);
            const flowPath = decodeURIComponent(encodedPath);

            if (!flowPath) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "flowPath required" }));
              return;
            }

            const content = await fs.readFile(flowPath, "utf-8");
            res.setHeader("Content-Type", "text/plain");
            res.end(content);
          } catch (err) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Flow file not found: ${String(err)}` }));
          }
          return;
        }

        // GET /api/flows?workspacePath=... — scan workspace for flow YAML files
        if (url.startsWith("/api/flows") && req.method === "GET") {
          try {
            const workspacePath = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("workspacePath") ?? "");
            if (!workspacePath) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify([]));
              return;
            }

            // Recursively scan up to depth 3 for .yml/.yaml files
            const flowSummaries: Array<{
              flowPath: string;
              name: string;
              schemaVersion: string;
              nodeCount: number;
              agentCount: number;
            }> = [];

            async function scanDir(dirPath: string, depth: number): Promise<void> {
              if (depth > 3) return;
              let entries;
              try {
                entries = await fs.readdir(dirPath, { withFileTypes: true });
              } catch { return; }

              for (const entry of entries) {
                // Skip .git and node_modules entirely; show other dot entries
                if (entry.name === "node_modules" || entry.name === ".git") continue;

                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                  await scanDir(fullPath, depth + 1);
                } else if (/\.(yml|yaml)$/.test(entry.name)) {
                  try {
                    const content = await fs.readFile(fullPath, "utf-8");
                    const parsed = parseFlowYaml(content);
                    const validation = safeValidateFlowDefinition(parsed);
                    if (validation.success) {
                      flowSummaries.push({
                        flowPath: fullPath,
                        name: parsed.meta?.name ?? entry.name.replace(/\.(yml|yaml)$/, ""),
                        schemaVersion: parsed.meta?.schemaVersion ?? "1.0",
                        nodeCount: parsed.graph?.nodes?.length ?? 0,
                        agentCount: parsed.agents?.agentDefs?.length ?? 0,
                      });
                    }
                  } catch {
                    // Skip invalid flow files
                  }
                }
              }
            }

            await scanDir(workspacePath, 0);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(flowSummaries));
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify([]));
          }
          return;
        }

        next();
      });
    },
  };
}

/**
 * Web app Vite config — standalone browser app.
 *
 * In dev mode, runs on port 3000 with HMR.
 * Uses HTTP adapter for backend communication.
 */
export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react(), workspaceApiPlugin()],
  root: path.resolve(__dirname, "src"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@agentsflow/platform-adapter": path.resolve(
        __dirname,
        "../../packages/platform-adapter/src/index.ts",
      ),
      "@agentsflow/ui-flow": path.resolve(
        __dirname,
        "../../packages/ui-flow/src/index.ts",
      ),
    },
  },
});