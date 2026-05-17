import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { FlowDefinitionSchema, type FlowDefinition } from "../schema/flow-definition.js";
import type { z } from "zod";

/**
 * Parse a YAML string into a validated FlowDefinition.
 * Throws ZodError if validation fails.
 */
export function parseFlowYaml(yamlString: string): FlowDefinition {
  const raw = parseYaml(yamlString);
  return FlowDefinitionSchema.parse(raw);
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
