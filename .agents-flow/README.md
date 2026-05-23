# .agents-flow Directory

This directory contains prompt assets that define agents, instructions, and skills for AgentsFlow.

## Structure

```
.agents-flow/
  global-system-prompt.md          # repo-wide baseline prompt (no frontmatter)
  agents/
    *.agent.md                     # executable agent definitions
  instructions/
    *.instructions.md              # reusable instruction fragments
  skills/
    <name>/SKILL.md                # skill folders (prompt-only in MVP)
```

## How It Works

1. **Scanner** reads the directory tree using a platform-agnostic filesystem interface
2. **Parser** extracts YAML frontmatter from each file and validates against Zod schemas
3. **Resolver** builds a `PromptAssetManifest` — a normalized map of all agents, instructions, and skills
4. **Assembler** combines layers into a `ProviderPromptPackage` for runtime consumption

## Prompt Assembly Order

When a flow node references an agent via `node.agentRef`, the prompt is assembled in this order:

1. **global-system-prompt.md** — unless `includes.globalSystemPrompt: false`
2. **Referenced instructions** — by short `name` (e.g. `"plan-format"`)
3. **Referenced skills** — by folder name (e.g. `"codebase-search"`)
4. **Agent body** — markdown content after frontmatter
5. **Node config overrides** — system/user prompts from the flow node
6. **Run input** — upstream data and runtime prompts

## Conventions

- Agent files: `.agent.md` with YAML frontmatter (required: `name`, `description`, `agentId`)
- Instruction files: `.instructions.md` with YAML frontmatter (required: `name`, `description`)
- Skill files: `SKILL.md` inside a named folder (required: `name`, `description`)
- Instructions are referenced by their `name` field, not by filename
- Skills are referenced by their folder name
- All `agentId` values must be unique across the repository

## Full Specification

See `docs/specs/003-agents-flow-repo-spec.md` for the complete specification.
