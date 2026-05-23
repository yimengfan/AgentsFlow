import type {
  PromptAssetManifest,
  ResolvedAgentAsset,
  PromptSegment,
  ProviderPromptPackage,
} from "@agentsflow/flow-schema";

/**
 * Assemble a `ProviderPromptPackage` from a resolved agent asset and the
 * full prompt asset manifest.
 *
 * Prompt assembly order (6 layers):
 *   1. global-system-prompt.md — if `includes.globalSystemPrompt !== false`
 *   2. Referenced `.instructions.md` files — in `includes.instructions` order
 *   3. Referenced SKILL.md bodies — in `includes.skills` order
 *   4. `.agent.md` body — markdown after frontmatter
 *   5. Node-level config overrides — passed as `nodeConfigOverrides`
 *   6. Run input / upstream data — passed as `runInput`
 *
 * Each instruction and skill is included only at its first occurrence
 * (deduplication within a single assembly).
 */
export function assemblePromptPackage(
  agent: ResolvedAgentAsset,
  manifest: PromptAssetManifest,
  nodeConfigOverrides?: {
    readonly systemPrompt?: string;
    readonly userPrompt?: string;
  },
  runInput?: {
    readonly userPrompt?: string;
    readonly data?: string;
  },
): ProviderPromptPackage {
  const segments: PromptSegment[] = [];
  const seenInstructions = new Set<string>();
  const seenSkills = new Set<string>();

  // Layer 1: global-system-prompt
  if (agent.includes.globalSystemPrompt && manifest.globalSystemPrompt) {
    segments.push({
      scope: "global-system-prompt",
      label: "Global System Prompt",
      sourcePath: ".agents-flow/global-system-prompt.md",
      content: manifest.globalSystemPrompt,
    });
  }

  // Layer 2: referenced instructions
  for (const instructionRef of agent.includes.instructions) {
    if (seenInstructions.has(instructionRef)) continue;
    seenInstructions.add(instructionRef);

    const instruction = manifest.instructions.get(instructionRef);
    if (instruction) {
      segments.push({
        scope: "instruction",
        label: instruction.name,
        sourcePath: instruction.sourcePath,
        content: instruction.content,
      });
    }
  }

  // Layer 3: referenced skills
  for (const skillRef of agent.includes.skills) {
    if (seenSkills.has(skillRef)) continue;
    seenSkills.add(skillRef);

    const skill = manifest.skills.get(skillRef);
    if (skill) {
      segments.push({
        scope: "skill",
        label: skill.name,
        sourcePath: skill.sourcePath,
        content: skill.content,
      });
    }
  }

  // Layer 4: agent body
  if (agent.body.trim()) {
    segments.push({
      scope: "agent-body",
      label: agent.name,
      sourcePath: agent.sourcePath,
      content: agent.body,
    });
  }

  // Layer 5: node config overrides
  if (nodeConfigOverrides?.systemPrompt?.trim()) {
    segments.push({
      scope: "node-config",
      label: "System Prompt Override",
      sourcePath: "node.config.systemPrompt",
      content: nodeConfigOverrides.systemPrompt,
    });
  }
  if (nodeConfigOverrides?.userPrompt?.trim()) {
    segments.push({
      scope: "node-config",
      label: "User Prompt Override",
      sourcePath: "node.config.userPrompt",
      content: nodeConfigOverrides.userPrompt,
    });
  }

  // Layer 6: run input / upstream data
  if (runInput?.userPrompt?.trim()) {
    segments.push({
      scope: "run-input",
      label: "User Prompt",
      sourcePath: "runInput.userPrompt",
      content: runInput.userPrompt,
    });
  }
  if (runInput?.data?.trim()) {
    segments.push({
      scope: "run-input",
      label: "Input Data",
      sourcePath: "runInput.data",
      content: runInput.data,
    });
  }

  // Assemble final prompt string (join with double newline for clear separation)
  const prompt = segments.map((s) => s.content).join("\n\n");

  // Map outputKind → expectedOutput
  const expectedOutput = mapExpectedOutput(agent.outputKind);

  return {
    prompt,
    expectedOutput,
    turnMode: agent.turnMode ?? "normal",
    outputKind: agent.outputKind,
    segments,
  };
}

/**
 * Map `outputKind` to the `expectedOutput` contract.
 */
function mapExpectedOutput(
  outputKind: "text" | "plan" | "score",
): ProviderPromptPackage["expectedOutput"] {
  switch (outputKind) {
    case "plan":
      return { schemaRef: "plan" };
    case "score":
      return {
        schemaRef: "score",
        schema: {
          type: "object",
          properties: {
            score: { type: "number" },
            canComplete: { type: "boolean" },
            reason: { type: "string" },
          },
        },
      };
    case "text":
      return undefined;
  }
}
