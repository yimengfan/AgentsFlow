import type { FlowDefinition } from "../schema/flow-definition.js";

/**
 * Current supported schema versions.
 * The host must support at least N-1 versions.
 */
const SUPPORTED_VERSIONS = ["1.0"];

/**
 * Migrate a flow definition from an older schema version to the latest.
 *
 * Migration strategy:
 *   - Each migration step is a pure function that transforms the data
 *   - Migrations are applied sequentially from the current version to the latest
 *   - The host must support at least N-1 schema versions
 *
 * For now, we only have version 1.0, so migration is a no-op.
 */
export function migrateFlow(flow: FlowDefinition): FlowDefinition {
  const version = flow.meta.schemaVersion;

  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported flow schema version: ${version}. ` +
      `Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`
    );
  }

  // Future migrations go here:
  // if (version === "1.0") { return migrateV1toV2(flow); }

  return flow;
}
