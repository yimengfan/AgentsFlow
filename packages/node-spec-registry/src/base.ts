import type { PortDef, ParamDef } from "@agentsflow/flow-schema";

// ─── Node Spec Core Types ──────────────────────────────────

/**
 * A NodeSpec defines the blueprint for a node kind.
 * It declares what ports a node has, what parameters it accepts,
 * what category it belongs to, and other metadata for the editor and engine.
 *
 * Each NodeSpec is now registered via a standalone class in
 * `nodes/` directory — see {@link NodeSpecBase} for the base class.
 */
export interface NodeSpec {
  /** Machine-readable kind identifier (e.g. "loader.http-auth", "agent.main") */
  readonly kind: string;
  /** Human-readable display label */
  readonly label: string;
  /**
   * Category path for palette grouping, using "/" as separator
   * (e.g. "Loader/HTTP", "Agent/Main", "Control/Flow")
   */
  readonly category: string;
  /** Detailed description / tooltip */
  readonly description: string;
  /** Icon identifier for the palette (e.g. "globe", "bot", "repeat") */
  readonly icon: string;
  /** Input port definitions */
  readonly inputPorts: ReadonlyArray<PortDef>;
  /** Output port definitions */
  readonly outputPorts: ReadonlyArray<PortDef>;
  /** Parameter definitions for this node's config form */
  readonly params: ReadonlyArray<ParamDef>;
  /** Compatible node kind for legacy nodeType mapping */
  readonly legacyNodeType?: string;
  /** Tags for filtering in the palette */
  readonly tags: ReadonlyArray<string>;
  /** Whether this kind appears in the palette (false = internal-only) */
  readonly visible: boolean;
  /** Maximum instances allowed per flow (0 = unlimited) */
  readonly maxInstances: number;
  /**
   * Flow direction hint for the canvas renderer.
   * "horizontal" = flow goes left→right (default)
   * "vertical"   = flow goes top→bottom (legacy behavior)
   */
  readonly flowDirection: "horizontal" | "vertical";
  /** UI hint for pre-populating the agent binding dropdown. Does not affect runtime. */
  readonly presetAgentRef?: string;
}

// ─── NodeSpecBase — abstract base class for individual node definitions ───

/**
 * Base class for defining a node type as a standalone class.
 *
 * Usage:
 * ```ts
 * // in nodes/loader-http-auth.ts
 * import { NodeSpecBase } from "../base.js";
 *
 * export class LoaderHttpAuthSpec extends NodeSpecBase {
 *   readonly kind = "loader.http-auth";
 *   readonly label = "HTTP 数据加载";
 *   readonly category = "Loader/HTTP";
 *   readonly description = "从三方 API 加载数据，支持 Auth 认证";
 *   readonly icon = "globe";
 *   readonly inputPorts = [...];
 *   readonly outputPorts = [...];
 *   readonly params = [...];
 * }
 * ```
 *
 * Then register it:
 * ```ts
 * import { LoaderHttpAuthSpec } from "./nodes/loader-http-auth.js";
 * registry.registerClass(LoaderHttpAuthSpec);
 * ```
 */
export abstract class NodeSpecBase implements NodeSpec {
  abstract readonly kind: string;
  abstract readonly label: string;
  abstract readonly category: string;
  abstract readonly description: string;
  abstract readonly icon: string;
  abstract readonly inputPorts: ReadonlyArray<PortDef>;
  abstract readonly outputPorts: ReadonlyArray<PortDef>;
  abstract readonly params: ReadonlyArray<ParamDef>;

  readonly legacyNodeType?: string;
  readonly tags: ReadonlyArray<string> = [];
  readonly visible: boolean = true;
  readonly maxInstances: number = 0;
  readonly flowDirection: "horizontal" | "vertical" = "horizontal";
  readonly presetAgentRef?: string;
}
