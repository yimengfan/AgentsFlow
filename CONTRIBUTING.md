# Contributing to AgentsFlow

Thank you for your interest in contributing! This guide covers the essentials.

## Development Setup

### Prerequisites

- **Node.js** ≥ 20 (recommended: 22 via [nvm](https://github.com/nvm-sh/nvm))
- **pnpm** 9.15+ (`corepack prepare pnpm@9.15.4 --activate`)

### Quick Start

```bash
git clone https://github.com/<org>/AgentsFlow.git
cd AgentsFlow
pnpm install
pnpm build
```

### Development Modes

```bash
# Web preview (recommended for UI work, port 3000)
pnpm dev:web

# Desktop preview (Electron, port 5173)
pnpm dev:desktop
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feat/my-feature
```

### 2. Develop

- Follow the [code conventions](./.github/copilot-instructions.md)
- ESM imports must include `.js` extensions
- Use `readonly` for all DTO properties
- Add tests for new functionality

### 3. Verify

```bash
pnpm typecheck    # No type errors
pnpm test         # All tests pass
pnpm build        # Clean build
```

### 4. Commit

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(flow-engine): add loop iteration limit
fix(platform-adapter): handle IPC timeout gracefully
docs(readme): add architecture diagram
```

### 5. Push & PR

```bash
git push origin feat/my-feature
```

Open a Pull Request against `main`. CI will run typecheck + test + build.

## Project Structure

See [MAINTENANCE.md](./MAINTENANCE.md) for the full architecture guide.

```
packages/          # Shared libraries (@agentsflow/*)
apps/desktop/      # Electron desktop shell
apps/web/          # Pure web app (Vite only)
apps/studio/       # Shared renderer
```

## Key Conventions

- **ESM only** — `"type": "module"` everywhere, `.js` in imports
- **Strict TypeScript** — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Platform abstraction** — UI components use `usePlatform()`, never access IPC/HTTP directly
- **Immutable DTOs** — `readonly` arrays and properties
- **IPC channels** — `domain:action` format (e.g. `flow:list`)

## Getting Help

- Open an [Issue](https://github.com/<org>/AgentsFlow/issues) for bugs or feature requests
- See [MAINTENANCE.md](./MAINTENANCE.md) for detailed architecture docs

## License

By contributing, you agree that your contributions will be licensed under [Apache-2.0](./LICENSE).
