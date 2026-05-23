import { NodeSpecBase, type NodeSpec } from "./base.js";
export { NodeSpecBase, type NodeSpec } from "./base.js";

// ─── Registry ──────────────────────────────────────────────

/**
 * In-memory registry of NodeSpecs.
 * Supports:
 * - Class-based registration (preferred): `registerClass(MySpecClass)`
 * - Object-based registration (legacy): `register(specObject)`
 * - Dynamic registration (YAML extensions)
 */
export class NodeSpecRegistry {
  private readonly specs = new Map<string, NodeSpec>();

  /** Register a node spec from a class constructor (instantiates it). */
  registerClass(ctor: new () => NodeSpecBase): void {
    const instance = new ctor();
    this.register(instance);
  }

  /** Register multiple class-based specs at once. */
  registerClasses(ctors: ReadonlyArray<new () => NodeSpecBase>): void {
    for (const ctor of ctors) {
      this.registerClass(ctor);
    }
  }

  /** Register a node spec object. Overwrites if kind already exists. */
  register(spec: NodeSpec): void {
    this.specs.set(spec.kind, spec);
  }

  /** Register a batch of node spec objects. */
  registerMany(specs: ReadonlyArray<NodeSpec>): void {
    for (const spec of specs) {
      this.register(spec);
    }
  }

  /** Get a spec by kind. Returns undefined if not found. */
  get(kind: string): NodeSpec | undefined {
    return this.specs.get(kind);
  }

  /** List all registered specs. */
  list(): ReadonlyArray<NodeSpec> {
    return [...this.specs.values()];
  }

  /** List specs filtered by top-level category (before "/"). */
  listByCategory(category: string): ReadonlyArray<NodeSpec> {
    return [...this.specs.values()].filter((s) => {
      const topCat = s.category.split("/")[0] ?? s.category;
      return topCat === category || s.category === category;
    });
  }

  /** List specs filtered by full category path (e.g. "Loader/HTTP"). */
  listByCategoryPath(categoryPath: string): ReadonlyArray<NodeSpec> {
    return [...this.specs.values()].filter((s) => s.category === categoryPath);
  }

  /**
   * List all unique category paths.
   * For "Loader/HTTP" → includes both "Loader" and "Loader/HTTP"
   */
  listCategoryPaths(): ReadonlyArray<string> {
    const paths = new Set<string>();
    for (const spec of this.specs.values()) {
      if (!spec.visible) continue;
      paths.add(spec.category);
      const top = spec.category.split("/")[0];
      if (top && top !== spec.category) {
        paths.add(top);
      }
    }
    return [...paths];
  }

  /**
   * Build a hierarchical category tree for the context menu.
   * Returns a map: topLevelCategory → subCategory → specs[]
   * Categories without "/" are treated as top-level with no sub-categories.
   */
  buildCategoryTree(): ReadonlyMap<string, ReadonlyMap<string, ReadonlyArray<NodeSpec>>> {
    const tree = new Map<string, Map<string, NodeSpec[]>>();

    for (const spec of this.specs.values()) {
      if (!spec.visible) continue;

      const parts = spec.category.split("/");
      const top = parts[0] ?? spec.category;
      const sub = parts.slice(1).join("/") || "__root__";

      if (!tree.has(top)) {
        tree.set(top, new Map());
      }
      const subMap = tree.get(top)!;
      if (!subMap.has(sub)) {
        subMap.set(sub, []);
      }
      subMap.get(sub)!.push(spec);
    }

    return tree;
  }

  /** Check if a kind is registered. */
  has(kind: string): boolean {
    return this.specs.has(kind);
  }

  /** Resolve legacy nodeType to a NodeSpec kind. */
  resolveFromLegacyNodeType(nodeType: string): NodeSpec | undefined {
    for (const spec of this.specs.values()) {
      if (spec.legacyNodeType === nodeType) return spec;
    }
    return undefined;
  }

  /**
   * Resolve an effective NodeSpec from a node's nodeKind or nodeType.
   * nodeKind takes precedence; falls back to legacy nodeType resolution.
   */
  resolve(nodeKind: string | undefined, nodeType: string | undefined): NodeSpec | undefined {
    if (nodeKind) return this.get(nodeKind);
    if (nodeType) return this.resolveFromLegacyNodeType(nodeType);
    return undefined;
  }
}

// ─── Built-in node classes are in ./nodes/*.ts ─────────────
// Individual node specs are now defined as separate classes.
// See nodes/ directory for all built-in node types.
//
// Import them and register via:
//   registry.registerClasses([LoaderHttpAuthSpec, ...])
//
// Or use the factory: createDefaultRegistry()

export { LoaderWorkDirSpec } from "./nodes/loader-work-dir.js";
export { LoaderHttpAuthSpec } from "./nodes/loader-http-auth.js";
export { LoaderLocalDirSpec } from "./nodes/loader-local-dir.js";
export { AgentMainSpec } from "./nodes/agent-main.js";
export { AgentSubSpec } from "./nodes/agent-sub.js";
export { ControlPlanLoopSpec } from "./nodes/control-plan-loop.js";
export { ControlFinishSpec } from "./nodes/control-finish.js";
export { InputPromptSpec } from "./nodes/input-prompt.js";

import { LoaderWorkDirSpec } from "./nodes/loader-work-dir.js";
import { LoaderHttpAuthSpec } from "./nodes/loader-http-auth.js";
import { LoaderLocalDirSpec } from "./nodes/loader-local-dir.js";
import { AgentMainSpec } from "./nodes/agent-main.js";
import { AgentSubSpec } from "./nodes/agent-sub.js";
import { ControlPlanLoopSpec } from "./nodes/control-plan-loop.js";
import { ControlFinishSpec } from "./nodes/control-finish.js";
import { InputPromptSpec } from "./nodes/input-prompt.js";

// ─── Default Registry Factory ──────────────────────────────

/** All built-in node spec classes, in category order. */
export const BUILTIN_NODE_CLASSES: ReadonlyArray<new () => NodeSpecBase> = [
  LoaderWorkDirSpec,
  LoaderHttpAuthSpec,
  LoaderLocalDirSpec,
  InputPromptSpec,
  AgentMainSpec,
  AgentSubSpec,
  ControlPlanLoopSpec,
  ControlFinishSpec,
];

/**
 * Create a registry pre-loaded with all built-in node specs.
 */
export function createDefaultRegistry(): NodeSpecRegistry {
  const registry = new NodeSpecRegistry();
  registry.registerClasses(BUILTIN_NODE_CLASSES);
  return registry;
}

/**
 * Create a registry with built-ins plus flow-local extensions.
 */
export function createRegistryWithExtensions(extraSpecs: ReadonlyArray<NodeSpec> = []): NodeSpecRegistry {
  const registry = createDefaultRegistry();
  registry.registerMany(extraSpecs);
  return registry;
}