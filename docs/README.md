# Docs Map

This directory is the primary home for durable project knowledge.

Use the following document layers.

## Information Architecture

| Layer | Purpose | Should Contain | Should Not Contain |
| ----- | ------- | -------------- | ------------------ |
| `README.md` | External project entry | product overview, quick start, package map, links into docs | deep implementation detail, long maintenance rules |
| `docs/prd/` | Product requirements and delivery goals | product problem statement, phase scope, Objective / KR, roadmap, governance | runtime contracts, low-level implementation detail, architecture rationale |
| `.github/copilot-instructions.md` | AI contributor operating constraints | hard coding rules, validation requirements, doc lookup order, repo-specific pitfalls | full architecture narratives already covered by docs |
| `MAINTENANCE.md` | Maintainer and operations handbook | environment setup details, build and release recipes, troubleshooting, maintainer runbooks | canonical architecture decisions or executable runtime contracts |
| `docs/adr/` | Architecture decisions | context, decision, consequences, invariants | step-by-step contributor workflow or repeated quick start |
| `docs/specs/` | Executable maintenance contracts | source of truth, binding rules, schemas, runtime contracts | historical rationale already captured by ADRs |
| `CONTRIBUTING.md` | Human contribution workflow | setup, branch and PR expectations, validation checklist, pointers to conventions | duplicated architecture content |

## Reading Order

### New to the repo

1. Root `README.md`
2. `docs/README.md`
3. `CONTRIBUTING.md`
4. Relevant ADR or spec for the area you will touch

### Changing runtime or flow semantics

1. `docs/adr/002-flow-runtime-extension.md`
2. `docs/specs/001-flow-node-contract.md`
3. `docs/specs/002-runtime-binding.md`
4. `docs/specs/003-agents-flow-repo-spec.md`
5. Canonical schema in `packages/flow-schema/src/schema/flow-definition.ts`

### Changing agent definitions or prompt assets

1. `docs/specs/003-agents-flow-repo-spec.md`
2. `packages/flow-schema/src/schema/agents-flow-assets.ts`
3. `packages/prompt-asset-resolver/` (scanner, parser, resolver, assembler, provider-package, adapter-registry)

### Changing product scope or delivery goals

1. `docs/prd/agentsflow-prd.md`
2. `docs/prd/prd-management.md`
3. Relevant ADR or spec for the affected area
4. Target implementation anchors in `packages/` or `apps/`

### Changing the workbench UI shell

1. `docs/adr/001-workbench-layout.md`
2. `.github/copilot-instructions.md`
3. `packages/ui-flow/src/components/workbench.tsx`
4. `packages/ui-flow/src/store/workbench-store.ts`

### Adding or modifying tests

1. `docs/testing-supplementation.md`
2. `.github/copilot-instructions.md` §5 (测试约束)
3. `packages/testing-kit/` (FakeAgentAdapter, golden fixtures)
4. Existing test files in the target package

## Current Document Set

### ADRs

- `docs/adr/001-workbench-layout.md`: workbench shell structure, panel ownership, layout invariants
- `docs/adr/002-flow-runtime-extension.md`: static flow definition, runtime scheduler model, adapter extension boundaries

### Specs

- `docs/specs/001-flow-node-contract.md`: node kind, port, param, debug, and custom-node maintenance contract
- `docs/specs/002-runtime-binding.md`: current executable path from `node.agentId` to adapter transport
- `docs/specs/003-agents-flow-repo-spec.md`: `.agents-flow/` directory convention, prompt asset model, agent reference binding, prompt assembly order

### PRDs

- `docs/prd/agentsflow-prd.md`: current-stage product PRD with Objective / KR structure, scope, gaps, and roadmap
- `docs/prd/prd-management.md`: PRD governance, state transitions, traceability, and change gates

### Supporting Guides

- `MAINTENANCE.md`: maintainer-facing setup, build, release, and troubleshooting handbook
- `CONTRIBUTING.md`: contributor workflow and verification checklist
- `docs/testing-supplementation.md`: test addition principles, per-package gap analysis, naming conventions, fixture patterns, and quality gates
- `.github/copilot-instructions.md`: AI-specific hard rules and doc lookup order

## Authoring Rules

- Prefer linking to an existing ADR or spec over restating the same rules.
- Put product goals, staged delivery scope, and roadmap in `docs/prd/` rather than duplicating them in ADRs or package docs.
- Put stable rationale in ADRs, executable rules in specs, and contributor behavior in `CONTRIBUTING.md` or `.github/copilot-instructions.md`.
- Keep `MAINTENANCE.md` focused on operations, troubleshooting, and maintainer procedures.
- Keep `.github/copilot-instructions.md` short enough to be scanned before editing.
- When a new document is added, update this map and add at least one inbound link from `README.md` or `CONTRIBUTING.md`.
