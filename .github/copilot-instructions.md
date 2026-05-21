# AgentsFlow — GitHub Copilot Instructions

This file contains repo-specific operating rules for AI contributors.

Keep durable architecture detail in `docs/`; do not duplicate full ADR or spec content here.

## Read Order

| Need | Primary Source |
| ---- | -------------- |
| Project overview and quick start | `README.md` |
| Documentation map | `docs/README.md` |
| Human contribution workflow | `CONTRIBUTING.md` |
| Maintainer and operations guide | `MAINTENANCE.md` |
| Workbench shell constraints | `docs/adr/001-workbench-layout.md` |
| Flow runtime model | `docs/adr/002-flow-runtime-extension.md` |
| Node and runtime contract | `docs/specs/001-flow-node-contract.md` |
| Runtime binding path | `docs/specs/002-runtime-binding.md` |

## Repo Snapshot

- AgentsFlow is a pnpm monorepo with `apps/desktop`, `apps/web`, `apps/studio`, and shared packages under `packages/`.
- `@agentsflow/ui-flow` owns the shared React workbench and flow editor surface.
- `@agentsflow/platform-adapter` owns the runtime boundary between Electron IPC and HTTP.
- Build from the repo root so pnpm can honor workspace topology.

## Non-Negotiable Rules

### Build and runtime

- All packages are ESM-only. Local imports must include `.js`.
- Library packages use `moduleResolution: Node16`. Vite app code uses `bundler`.
- TypeScript is strict. Do not assign explicit `undefined` to optional properties.
- DTOs and public data shapes use `readonly` properties and arrays.
- Prefer fixing the source schema or contract instead of patching around it in downstream adapters.

### Platform abstraction

- UI code must use `PlatformProvider` and `usePlatform()`.
- Do not call Electron IPC or raw HTTP directly from UI components.
- When adding a new platform capability, update the full chain:
  1. `packages/shared-contracts/src/types/ipc-channels.ts`
  2. `apps/desktop/src/main/app.ts`
  3. `apps/desktop/src/main/preload.ts`
  4. `packages/platform-adapter/src/platform-api.ts`
  5. `packages/platform-adapter/src/electron-adapter.ts`
  6. `packages/platform-adapter/src/http-adapter.ts`

### Workbench shell

- All app entries render `<Workbench />`.
- `<Workbench>` is the only owner of `100vh` by `100vw`.
- Do not add `position: fixed` or `position: absolute` inside the workbench layout tree.
- Shell dimensions and colors must come from `workbench-tokens.ts`.
- With `react-resizable-panels`, use `ImperativePanelHandle` plus `isCollapsed()` guards before `collapse()` or `expand()`.
- Never use `autoSaveId` on workbench `PanelGroup`.
- Left sidebar content must switch through `activeLeftView` and `renderLeftSidebarContent(...)`.
- Any component using `useReactFlow()` must be wrapped in `<ReactFlowProvider>`.

### Flow runtime

- `packages/flow-schema/src/schema/flow-definition.ts` is the canonical flow schema.
- Runtime binding follows `node.agentId -> agentDef.agentId -> adapterKind -> runtime adapter extension -> transport`.
- `layout.nodeBindings` is descriptive metadata, not the executable source of truth.
- Runtime state must not be written back into YAML.
- New provider integrations should extend the runtime adapter registry instead of coupling core packages to a vendor.

## Common Changes

### Adding a package

1. Create the package under `packages/`.
2. Add `package.json` with `"type": "module"` and workspace dependencies.
3. Add `tsconfig.json` extending the root base config.
4. Export from `src/index.ts`.
5. Add a project reference in the root `tsconfig.json`.
6. Run `pnpm install`.

### Adding an app

1. Create the app under `apps/`.
2. Use `"type": "module"`.
3. Use `bundler` module resolution for Vite entries.
4. Add a Vite config with workspace aliases.
5. Wrap the app entry in `PlatformProvider`.
6. Run `pnpm install`.

## Verification

- Activate nvm before Node commands:

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

- After any code change, run:
  1. `pnpm typecheck`
  2. `pnpm build`
  3. `pnpm test`
- For UI changes, also run `pnpm dev:web` and verify the page renders on `http://localhost:3000/` with no runtime console errors.

## Pitfalls

- Missing `.js` import extensions cause `ERR_MODULE_NOT_FOUND`.
- `pnpm --filter` must appear before `-r`, and negated filters must be quoted.
- `exactOptionalPropertyTypes` means `foo?: string` is not the same as `foo: string | undefined`.
- `react-resizable-panels` `autoSaveId` conflicts with imperative panel control.
- Hardcoded shell dimensions or colors drift from the workbench token system.
- Keep this file short. Put stable rationale in ADRs, executable contracts in specs, and update `docs/README.md` when adding new docs.
