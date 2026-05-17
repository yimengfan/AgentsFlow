import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Web app Vite config — standalone browser app.
 *
 * In dev mode, runs on port 3000 with HMR.
 * Uses HTTP adapter for backend communication.
 */
export default defineConfig({
  plugins: [react()],
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