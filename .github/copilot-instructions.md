# AgentsFlow — GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with the AgentsFlow codebase.

## Project Overview

AgentsFlow is a graph-based AI agent orchestration framework built as a pnpm monorepo. It has a dual-platform architecture: **Web** (Vite-only, daily preview) and **Desktop** (Electron, production app). Both share the same React renderer through a platform adapter abstraction.

## Build & Run Commands

```bash
# Install dependencies
pnpm install

# Build all packages (MUST run before dev)
pnpm build

# Type check all packages
pnpm typecheck

# Run tests
pnpm test

# Dev: Web mode (browser preview, port 3000)
pnpm dev:web

# Dev: Desktop mode (Electron + Vite, port 5173)
pnpm dev:desktop

# Clean all build artifacts
pnpm clean
```

## Architecture

### Monorepo Structure

- `packages/` — shared libraries, published as `@agentsflow/*`
- `apps/desktop` — Electron shell (main process + preload + renderer entry)
- `apps/web` — pure Vite browser app (HTTP adapter)
- `apps/studio` — shared renderer entry (used by both desktop and web)

### Platform Abstraction

- `@agentsflow/platform-adapter` provides `PlatformApi` interface
- Electron mode: `window.agentsflow` IPC bridge (via preload.ts)
- Web mode: `fetch()` REST API calls to `VITE_API_BASE_URL`
- `PlatformProvider` React context auto-detects and injects correct adapter
- UI components use `usePlatform()` hook — never access IPC/HTTP directly

### Dependency Graph

```
shared-contracts (zero deps)
    ├── agent-contracts
    ├── flow-schema (zod, yaml)
    ├── platform-adapter
    │       └── ui-flow (react, xyflow, zustand, monaco)
    ├── flow-engine
    ├── agent-registry
    ├── local-store
    └── testing-kit
```

Build order matters — always run `pnpm build` from root to respect topology.

## Code Conventions

### ESM Only

All packages use `"type": "module"`. Imports MUST include `.js` extension:

```typescript
// ✅ Correct
import { foo } from "./bar.js";

// ❌ Wrong — will fail at runtime
import { foo } from "./bar";
import { foo } from "./bar.ts";
```

### TypeScript Strictness

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Optional properties cannot be explicitly set to `undefined`
- All array/object DTOs use `readonly` modifier
- `composite: true` — all files must be covered by `include`

### Module Resolution

| Context | module | moduleResolution |
|---------|--------|------------------|
| Library packages | Node16 | Node16 |
| Vite/app code | ESNext | bundler |
| Electron main | Node16 | Node16 |

### Naming

- Packages: `@agentsflow/kebab-case`
- Files: `kebab-case.ts` / `kebab-case.tsx`
- IPC channels: `domain:action` (e.g. `flow:list`, `run:start`)
- Interfaces: PascalCase (`FlowApi`, `RunStatus`)
- Functions: camelCase (`createApp`, `detectPlatform`)

### React / UI

- React 19 with JSX transform (no `import React` needed in components)
- Zustand 5.x with `persist` middleware for localStorage (`useWorkbenchStore`, `useWorkspaceStore`)
- `@xyflow/react` for flow canvas
- `@monaco-editor/react` for YAML editing
- `react-resizable-panels` v2.1.9 for layout (`Panel`, `PanelGroup`, `PanelResizeHandle`, `ImperativePanelHandle`, `PanelOnCollapse`, `PanelOnExpand`)
- `react-resizable-panels` — use `ImperativePanelHandle` refs + `isCollapsed()` guards for programmatic panel control; NEVER use `autoSaveId`
- Theme system in `workbench-tokens.ts` — 3-layer abstraction (Theme Preset → Palette → Semantic Tokens); active theme: **Dark OLED**

### Workbench Layout (VS Code–style)

The app uses a **VS Code–style workbench layout** managed by `<Workbench>` (in `packages/ui-flow/src/components/workbench.tsx`). All three app entries render `<Workbench />`.

**Layout structure:**

```
Workbench (sole owner of 100vh × 100vw)
├── Toolbar (fixed height 40px)
│   ├── ☰ toggle left sidebar
│   ├── ▶ Run toggle bottom panel
│   └── 💬 toggle right sidebar
└── PanelGroup (horizontal)
    ├── Left Sidebar (collapsible: ActivityBar 48px + content pane)
    │   ├── ActivityBar (📁🔄🔍 icon strip)
    │   └── ExplorerPane | WorkspacePane | PreviewPane (switched by activeLeftView)
    ├── Center Workspace (TabBar + FlowEditorSurface + BottomPreview)
    └── Right Sidebar (collapsible: AssistantPanel with Assistant/Run Detail tabs)
```

**Panel control (CRITICAL):**

- Uses `ImperativePanelHandle` from `react-resizable-panels` (v2.1.9) for programmatic collapse/expand
- **`isCollapsed()` guard REQUIRED** before calling `panel.collapse()`/`panel.expand()` in useEffect — prevents infinite store→effect→callback→store loops
- **NEVER use `autoSaveId` on `PanelGroup`** — it persists panel sizes in the library's own localStorage key, which conflicts with and overrides imperative panel control. The Zustand store (`agentsflow-workbench-layout`) is the single source of truth for panel visibility.

**View switching:**

- Left sidebar content switches via `activeLeftView: LeftViewId` ("explorer" | "workspace" | "preview") — rendered by `renderLeftSidebarContent()` in workbench.tsx
- Right sidebar content switches via `activeRightView: RightViewId` ("assistant" | "run-detail") — rendered internally by AssistantPanel
- `setActiveLeftView()` and `setActiveRightView()` auto-expand the sidebar when switching views

**Layout invariants — DO NOT VIOLATE:**

1. **Workbench is the SOLE owner of `100vh × 100vw`** — no other component may set `height: 100vh` or `width: 100vw`
2. **No `position: fixed` or `position: absolute`** in Workbench children — all layout driven by `react-resizable-panels`
3. **Panel visibility driven ONLY by `WorkbenchStore`** — no component toggles its own visibility independently
4. **All shell dimensions come from `workbench-tokens.ts`** — no magic numbers in component files
5. **`CenterWorkspace` owns its internal vertical split** — bottom panel is a child of CenterWorkspace, not a sibling
6. **Sidebar collapse/expand must sync WorkbenchStore** via `onCollapse`/`onExpand` callbacks
7. **Never use `autoSaveId` on `PanelGroup`** — conflicts with imperative panel control
8. **`isCollapsed()` guard required** before imperative collapse/expand calls — prevents infinite loops

**Key stores:**
- `useWorkbenchStore` — chrome state (sidebar visibility, active views, panel sizes, persisted to localStorage key `agentsflow-workbench-layout`)
- `useWorkspaceStore` — multi-document state (flow list, open tabs, per-document YAML/flow/validation)
- `useFlowStore` — LEGACY single-document store (kept for backward compat with deprecated `FlowEditor`)

**Key files:** `workbench.tsx`, `workbench-store.ts`, `workspace-store.ts`, `workbench-tokens.ts`, `toolbar.tsx`, `activity-bar.tsx`, `explorer-pane.tsx`, `workspace-pane.tsx`, `preview-pane.tsx`, `tab-bar.tsx`, `center-workspace.tsx`, `flow-editor-surface.tsx`, `bottom-preview.tsx`, `assistant-panel.tsx`

**Panel constraints (from workbench-tokens.ts):**

| Panel | defaultSize | minSize | maxSize |
|-------|-------------|---------|---------|
| Left sidebar | 20% | 12% | 40% |
| Right sidebar | 25% | 15% | 45% |
| Bottom panel | 30% | 10% | 60% |

See `docs/adr/001-workbench-layout.md` for full design rationale.

### Immutability

All DTO types use `readonly`:

```typescript
interface FlowSummary {
  readonly flowPath: string;
  readonly nodeCount: number;
  readonly errors?: readonly string[];  // readonly array
}
```

### Theme System (workbench-tokens.ts)

The workbench uses a **3-layer token abstraction** for one-click theme swapping:

```
Layer 3 — Theme Presets (named collections: darkOled, darkCatppuccinMocha, darkOneDark)
Layer 2 — Palette (raw color values: bgBase, borderDefault, textPrimary, ...)
Layer 1 — Semantic Tokens (component API: SURFACE.toolbar, BORDER.default, TEXT.primary, ...)
```

**How it works:**
- Components ONLY import Layer 1 semantic tokens (`SURFACE`, `BORDER`, `TEXT`, etc.)
- Semantic tokens are auto-resolved from the active theme preset's palette
- Swapping themes = changing one argument (`resolveTokens(darkOled)` → `resolveTokens(darkCatppuccinMocha)`)
- No component code changes needed when switching themes

**Adding a new theme preset:**
1. Define a new `ThemePreset` object in `workbench-tokens.ts` with a `name` and `palette`
2. Add it to the `THEME_PRESETS` array
3. Change `resolveTokens(darkOled)` to `resolveTokens(yourNewPreset)` to activate

**Key types:** `ThemePreset`, `Palette`, `SemanticTokens`
**Available presets:** `darkOled` (active), `darkCatppuccinMocha`, `darkOneDark`
**Backward compat:** Named exports (`SURFACE`, `BORDER`, `TEXT`, etc.) are re-exported from `tokens` object

**Theme invariants — DO NOT VIOLATE:**
1. **Components MUST use semantic tokens only** — never reference palette colors or theme preset directly
2. **New color needs go in Palette first** — then map to a semantic token in `resolveTokens()`
3. **Theme preset names must be unique** — used as lookup keys in `getThemePreset()`
4. **Never hardcode hex values in components** — always reference from `workbench-tokens.ts`

## Key Patterns

### Adding a New IPC Channel

1. Add channel type to `packages/shared-contracts/src/types/ipc-channels.ts`
2. Add handler in `apps/desktop/src/main/app.ts` (`registerIpcHandlers`)
3. Add method to `apps/desktop/src/main/preload.ts` (`api` object)
4. Add method to `packages/platform-adapter/src/platform-api.ts` (interface)
5. Implement in `packages/platform-adapter/src/electron-adapter.ts`
6. Implement in `packages/platform-adapter/src/http-adapter.ts`

### Adding a New Package

1. Create directory under `packages/`
2. Add `package.json` with `"type": "module"`, workspace deps as `"workspace:*"`
3. Add `tsconfig.json` extending `../../tsconfig.base.json`
4. Add entry `src/index.ts` with all exports
5. Add reference in root `tsconfig.json`
6. Run `pnpm install` to link workspace deps

### Adding a New App

1. Create directory under `apps/`
2. Add `package.json` with `"type": "module"`, workspace deps as `"workspace:*"`
3. Add `tsconfig.json` extending `../../tsconfig.base.json` (use `bundler` moduleResolution for Vite)
4. Add `vite.config.ts` with `@vitejs/plugin-react` and resolve aliases
5. Add `src/index.html` with CSP headers
6. Add `src/index.tsx` wrapping `<Workbench>` in `<PlatformProvider>`
7. Run `pnpm install` to link workspace deps

## Environment

- **Node.js** ≥ 20 (use nvm: `nvm install 22`)
- **pnpm** 9.15.4 (`corepack prepare pnpm@9.15.4 --activate`)
- **Chinese mirrors**: `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`, `COREPACK_NPM_REGISTRY=https://registry.npmmirror.com`
- nvm activation required before any Node command: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`

## Coding Workflow

### Post-Code Verification (MANDATORY)

After making any code changes, you **MUST** run verification until all checks pass — do not stop at the first error; iterate and fix until clean:

1. **`pnpm typecheck`** — zero TypeScript errors across all packages
2. **`pnpm build`** — all packages and apps compile successfully
3. **`pnpm test`** — all existing tests still pass (if tests exist)
4. **Fix any errors found** — repeat steps 1–3 until everything is green
5. **Only declare the task complete** after all checks pass

Do NOT skip verification. Do NOT declare "done" while typecheck or build still has errors.

### E2E Visual Verification (MANDATORY for UI changes)

For any changes affecting the UI (components, styles, layout, store state that renders), you **MUST** perform end-to-end visual verification:

1. **Start dev server**: `pnpm dev:web` (port 3000)
2. **Open browser**: Navigate to `http://localhost:3000/` using the browser tools
3. **Verify page renders**: Confirm the page is not blank — check for toolbar, sidebars, and center content
4. **Test affected feature**: Interact with the changed UI element (click buttons, switch views, etc.)
5. **Check console errors**: Use `read_page` to review console events — no `pageError` events should be present
6. **If page is blank or crashed**: Fix the error before proceeding — check for missing providers, import errors, or runtime exceptions

Do NOT declare UI work "done" without visual verification in the browser.

## Common Pitfalls

1. **ESM `.js` extension missing** → Runtime ERR_MODULE_NOT_FOUND
2. **pnpm filter syntax** → `--filter` before `-r`, pattern must be quoted: `pnpm --filter '!@agentsflow/desktop' -r run build`
3. **CSP blocking Monaco** → Must include `script-src 'self' https://cdn.jsdelivr.net` and `worker-src 'self' blob:`
4. **Build order** → Always `pnpm build` from root; packages must build before apps
5. **exactOptionalPropertyTypes** → Cannot assign `undefined` to optional properties explicitly
6. **Vite resolve aliases** → Use aliases to point workspace packages at source for HMR during dev
7. **Workbench layout** → Never add `position: fixed/absolute` or `100vh/100vw` in Workbench children; all layout driven by `react-resizable-panels` and `WorkbenchStore`
8. **Shell dimensions** → Always source from `workbench-tokens.ts`, never hardcode pixel values in components
9. **Skip verification** → MUST run `pnpm typecheck`, `pnpm build`, `pnpm test` after code changes; iterate until all pass; do NOT declare done while errors remain
10. **autoSaveId conflict** → NEVER use `autoSaveId` on `react-resizable-panels` `PanelGroup` — it persists panel sizes in the library's own localStorage, overriding imperative `collapse()`/`expand()` calls. Use Zustand store as single source of truth instead.
11. **ImperativePanelHandle infinite loop** → MUST use `isCollapsed()` guard before calling `panel.collapse()`/`panel.expand()` in useEffect. Without it: store toggle → effect → collapse() → onCollapse callback → store toggle → ∞
12. **Left sidebar view switching** → Workbench must use `renderLeftSidebarContent(activeLeftView)` switch statement, NOT always render `<ExplorerPane />`. Activity bar buttons change `activeLeftView` in store but the workbench must read it and render the correct pane.
13. **Theme token hardcoding** → NEVER hardcode hex colors or pixel values in components. All visual values MUST come from `workbench-tokens.ts` semantic tokens. New colors go in `Palette` type first, then map to semantic tokens.
14. **ReactFlowProvider required** → `useReactFlow()` hook REQUIRES a `<ReactFlowProvider>` ancestor in the React tree. The `<ReactFlow>` component alone is NOT sufficient. Wrap `<FlowCanvas>` in `<ReactFlowProvider>` inside `flow-editor-surface.tsx`. Missing provider causes blank page crash with error: "Seems like you have not used zustand provider as an ancestor."
