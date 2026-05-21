import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react()],
  root: path.resolve(__dirname, "src"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@agentsflow/platform-adapter": path.resolve(
        __dirname,
        "../../packages/platform-adapter/src/index.ts",
      ),
    },
  },
});