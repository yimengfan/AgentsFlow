import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { FlowDefinitionSchema, type FlowDefinition } from "../schema/flow-definition.js";
import { validateFlowSemantics, type SemanticValidationResult } from "./validate.js";
import type { z } from "zod";

/**
 * Parse a YAML string into a validated FlowDefinition.
 * Throws ZodError if structural validation fails.
 * Also runs semantic validation and attaches results.
 */
export function parseFlowYaml(yamlString: string): FlowDefinition {
  const raw = parseYaml(yamlString);
  return FlowDefinitionSchema.parse(raw);
}

/**
 * Parse a YAML string and run both structural + semantic validation.
 * Returns the parsed flow along with any semantic errors/warnings.
 */
export function parseFlowYamlWithSemantics(yamlString: string): {
  flow: FlowDefinition;
  semantic: SemanticValidationResult;
} {
  const flow = parseFlowYaml(yamlString);
  const semantic = validateFlowSemantics(flow);
  return { flow, semantic };
}

/**
 * Serialize a FlowDefinition to YAML string.
 */
export function serializeFlowYaml(flow: FlowDefinition): string {
  return stringifyYaml(flow, { lineWidth: 0, minContentWidth: 0 });
}

/**
 * Validate a FlowDefinition without parsing.
 * Returns the validated data or throws ZodError.
 */
export function validateFlowDefinition(data: unknown): FlowDefinition {
  return FlowDefinitionSchema.parse(data);
}

/**
 * Safely validate a FlowDefinition, returning a result object.
 * Only checks structural (Zod) validation.
 */
export function safeValidateFlowDefinition(data: unknown): {
  success: true;
  data: FlowDefinition;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = FlowDefinitionSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Safely validate a FlowDefinition with both structural + semantic checks.
 * Returns the validated data along with semantic errors/warnings.
 * Structural failure short-circuits (no semantic check).
 */
export function safeValidateFlowDefinitionWithSemantics(data: unknown): {
  success: true;
  data: FlowDefinition;
  semantic: SemanticValidationResult;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = FlowDefinitionSchema.safeParse(data);
  if (result.success) {
    const semantic = validateFlowSemantics(result.data);
    return { success: true, data: result.data, semantic };
  }
  return { success: false, error: result.error };
}
