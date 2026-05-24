# AgentsFlow 测试增补原则与规范

本文档是 `.github/copilot-instructions.md` §5（测试约束）的详细展开，聚焦于"何时增补、如何增补、增补到什么程度"。核心精简规则已在 `copilot-instructions.md` 中，此处不重复。

---

## 1. 测试分层模型

| 层级 | 目的 | 覆盖范围 | 运行频率 | 依赖 |
|------|------|---------|---------|------|
| **单元测试** | 验证单个函数、类、schema 的契约 | 单个 export 的输入/输出 | 每次 `pnpm --filter <pkg> run test` | 无外部依赖 |
| **集成测试** | 验证包内多个模块协作，或跨包边界 | scheduler + executor + adapter；store + resolver | 同上 | 允许 `@agentsflow/testing-kit` |
| **E2E 需求测试** | 验证产品需求从 store/resolver 层面的端到端行为 | 需求 → store 操作 → 断言 | 同上 + 交付前 | 允许 `FakeAgentAdapter` |
| **Smoke 测试** | 验证渲染、启动、平台集成 | Workbench 渲染、Electron 启动 | 交付前手动 | `pnpm dev:web` / `dev:desktop` |

**升级原则**：优先单元测试 → 只有无法覆盖跨模块交互时才升级到集成 → 只有涉及 UI 或平台交互时才升级到 E2E/Smoke。

## 2. 包级测试缺口与优先级

### 2.1 当前覆盖状态

| Package | 测试文件数 | 测试用例数（约） | 覆盖面 | 优先级 |
|---------|-----------|----------------|--------|--------|
| `flow-schema` | 0 | 0 | ❌ 无 | **P0** |
| `agent-contracts` | 0 | 0 | ❌ 无 | **P0** |
| `flow-engine` | 0 | 0 | ❌ 无 | **P0** |
| `node-spec-registry` | 0 | 0 | ❌ 无 | **P1** |
| `agent-registry` | 0 | 0 | ❌ 无 | **P1** |
| `local-store` | 0 | 0 | ❌ 无 | **P1** |
| `platform-adapter` | 0 | 0 | ❌ 无 | **P2** |
| `pi-mono-runtime` | 0 | 0 | ❌ 无 | **P2** |
| `shared-contracts` | 0 | 0 | ❌ 无 | **P2** |
| `prompt-asset-resolver` | 1 | ~31 | ✅ scanner/parser/resolver/assembler/registry | — |
| `ui-flow` | 3 | ~20+ | ✅ workspace-store / runtime-store / requirements-e2e | — |
| `testing-kit` | 0 | 0 | ⚠️ 工具包，无需自测 | — |

### 2.2 优先级判定规则

- **P0**：规范性 schema 或核心契约包，被其他所有包依赖，改动影响面最大
- **P1**：运行时关键路径上的包，含复杂状态逻辑或全局注册表
- **P2**：平台适配层或边界包，改动频率低，影响面可控

### 2.3 P0 包测试增补要求

#### `flow-schema`

必须覆盖：
1. **Zod schema 验证**：`FlowDefinitionSchema.parse()` 对合法/非法输入的正确接受/拒绝
2. **默认值填充**：`optional().default()` 字段在缺失时自动填充
3. **`passthrough()` 行为**：未知字段被保留而不被剥离
4. **嵌套 schema 独立验证**：`AgentDefSchema`、`NodeDefSchema`、`EdgeDefSchema`、`PortDefSchema`、`ParamDefSchema`、`CustomNodeSpecSchema` 各自的边界
5. **`extensions.customNodeSpecs` 默认值**：缺失时默认 `[]`，非数组时拒绝
6. **YAML ↔ Zod round-trip**：从 YAML 字符串解析 → `FlowDefinitionSchema.parse()` → 序列化 → 重新解析，结果一致

```typescript
// 示例结构
describe("FlowDefinitionSchema", () => {
  it("accepts a valid minimal flow definition", () => { ... });
  it("fills defaults for optional fields", () => { ... });
  it("preserves unknown fields via passthrough", () => { ... });
  it("rejects missing required fields", () => { ... });
});

describe("AgentDefSchema", () => {
  it("fills default toolPolicy, memoryPolicy, subagentPolicy, timeouts, budgets", () => { ... });
  it("rejects invalid approvalRequirement", () => { ... });
});
```

#### `agent-contracts`

必须覆盖：
1. **类型导出完整性**：所有 exported types/interfaces 可被消费者正确 import
2. **`AgentAdapter` 接口契约**：`FakeAgentAdapter` 实现满足接口所有必选方法
3. **`AgentInvocation` / `AgentTurnResult` 结构验证**：required vs optional 字段
4. **`TurnMode` 枚举值完整性**

> 注意：纯类型包的测试重点是"编译时契约 + 运行时结构"，不是行为逻辑。可使用 `describe("type exports", ...)` + `expect(typeof ...).toBeDefined()` 模式。

#### `flow-engine`

必须覆盖：
1. **`FlowScheduler.startRun()`**：生成 runId、发射 `run_started` 事件、设置 RunContext 状态为 running
2. **`FlowScheduler` loader 节点驱动**：`loader.*` kind 节点将 input 传播到 `out` 和 `data` 端口
3. **`FlowScheduler` agent 节点驱动**：`agent.*` kind 节点解析 adapter、执行 NodeExecutor、传播结果到端口
4. **`FlowScheduler` plan-loop 驱动**：首轮路由到 plan、后续路由到 execute、满足阈值路由到 done、超过 maxIterations 强制 done
5. **`FlowScheduler` finish 驱动**：标记 run 完成
6. **`RunContext` 端口值存储**：`setPortValue` / `getPortValue` / `getNodePortValues`
7. **`RunContext` 节点输出存储**：`setNodeOutput` / `getNodeOutput`
8. **`RunContext` 循环计数器**：`incrementLoop` / `getLoopCount` / `resetLoop`
9. **`RunContext.getNextNodeId()`**：线性边遍历 + sourceHandle 条件路由
10. **`RunContext` 中断与恢复**：`addInterrupt` / `clearInterrupt` 状态切换
11. **`NodeExecutor.executeNode()`**：构建 AgentInvocation、调用 adapter.runTurn、发射事件
12. **`NodeExecutor` session 复用**：同一 `runId:agentId` 不重复 createSession
13. **`NodeExecutor` prompt 解析**：`promptPackage` 优先 → turnMode 分支（plan/evaluate/normal）
14. **`EventBus`**：on/emit/clear、通配符监听、监听器异常不中断分发
15. **`SubagentArbiter`**：仲裁决策逻辑

所有 `flow-engine` 测试必须使用 `FakeAgentAdapter`，不得 mock `FlowScheduler` 或 `NodeExecutor` 的内部方法。

### 2.4 P1 包测试增补要求

#### `node-spec-registry`

必须覆盖：
1. **`NodeSpecRegistry` 注册与查询**：register / registerMany / registerClass / get / has / list
2. **分类查询**：`listByCategory` / `listByCategoryPath` / `listCategoryPaths` / `buildCategoryTree`
3. **legacy 解析**：`resolveFromLegacyNodeType` / `resolve`（nodeKind 优先于 nodeType）
4. **`createDefaultRegistry()`**：包含所有 `BUILTIN_NODE_CLASSES`
5. **`createRegistryWithExtensions()`**：在内置基础上追加 custom specs
6. **每个内置 NodeSpec**：kind / category / ports / params 的结构完整性

#### `agent-registry`

必须覆盖：
1. **`DefaultAgentRegistry.registerAdapter()` / `getAdapter()`**：注册工厂、缓存实例
2. **`DefaultAgentRegistry.listAdapters()`**：列出所有 metadata
3. **`DefaultAgentRegistry.resolveCompatibility()`**：major 版本匹配 → full/partial/incompatible
4. **`DefaultAgentRegistry.unregisterAdapter()` / `clear()`**：清理与缓存失效

#### `local-store`

必须覆盖：
1. **`LocalStore.initialize()`**：schema migration 版本升级
2. **Run CRUD**：insertRun / updateRunStatus / getRun / listRuns
3. **Event 追加与查询**：appendEvent / queryEvents（各种 filter 组合）
4. **Artifact 存储**：insertArtifact / getArtifacts
5. **边界**：空数据库查询、分页、不存在的 runId

> `local-store` 测试需要 `SqlExecutor` 的 fake 实现。参照 `testing-kit` 的 `FakeAgentAdapter` 模式，创建 `FakeSqlExecutor`。

### 2.5 P2 包测试增补要求

#### `platform-adapter`

必须覆盖：
1. **`PlatformApi` 接口契约**：mock `window.agentsflow` 或 `fetch`，验证 Electron/HTTP 适配边界的正确调用
2. **`detectPlatform()`**：正确识别 electron vs web 环境
3. **HTTP 适配**：`HttpAdapter` 对每个 API 方法的正确 fetch 调用与错误处理

#### `pi-mono-runtime`

必须覆盖：
1. **`PiMonoAgentAdapter` 契约实现**：metadata、createSession、runTurn
2. **Transport 选择**：adapterConfig.transport = "deepseek" → DeepSeekTransport；其他 → PiMonoHttpTransport
3. **DeepSeek 请求格式**：messages 结构、model 参数传递
4. **pi-mono HTTP 请求格式**：自定义 headers、payload 结构

#### `shared-contracts`

必须覆盖：
1. **IPC channel 常量完整性**：所有 channel 字符串不为空、无重复
2. **DTO 结构验证**：关键字段的 required/optional 一致性

## 3. 契约测试原则

### 3.1 Schema 即规范

`flow-schema` 的 Zod schema 测试不是"测 Zod 本身"，而是测"schema 的约束是否与 spec 一致"：

- `docs/specs/001-flow-node-contract.md` → `NodeDefSchema` 测试
- `docs/specs/002-runtime-binding.md` → `AgentDefSchema` + `NodeBindingSchema` 测试
- `docs/specs/003-agents-flow-repo-spec.md` → `CustomNodeSpecSchema` 测试

### 3.2 Adapter 契约测试

所有 `AgentAdapter` 实现须通过以下契约测试：

```typescript
describe("<AdapterName> satisfies AgentAdapter contract", () => {
  it("has valid metadata with required fields", () => { ... });
  it("createSession returns { sessionId, adapterKind }", async () => { ... });
  it("runTurn returns AgentTurnResult with status completed or failed", async () => { ... });
  it("dispose does not throw", async () => { ... });
});
```

## 4. 运行时绑定路径必测场景

链路：`node.agentId → agentDef.agentId → adapterKind → runtime adapter registry → AgentAdapter → transport`

1. **正常路径**：合法 agentId → 找到 agentDef → 解析 adapter → 执行 turn → 返回结果
2. **缺失 agentId**：节点未指定 agentId → 抛出明确错误
3. **未知 agentDef**：agentId 不在 flow.agents.agentDefs 中 → 抛出明确错误
4. **未知 adapterKind**：agentDef.adapterKind 无对应注册 → 抛出明确错误
5. **Session 复用**：同一 runId + agentId 的多次执行共享 session
6. **Prompt 资产绑定**：`node.agentRef` + promptAssetManifest → assemblePromptPackage → 注入 context.promptPackage

## 5. Prompt 装配顺序必测场景

装配顺序：`global-system-prompt → instructions → skills → agent-body → node-config → run-input`

1. **完整 6 层装配**：所有层都有内容时，segment 的 scope 顺序正确
2. **去重**：同一 instruction/skill 被引用多次时只出现一次
3. **优雅降级**：manifest 中缺少某层内容时不报错，只是该层 segment 缺失
4. **source 归因**：每个 segment 都有正确的 sourcePath
5. **globalSystemPrompt 过滤**：agent `includes.globalSystemPrompt = false` 时不包含该层

## 6. Fixture 与测试工具模式

### 6.1 内存文件系统

对依赖文件系统读写的模块（scanner、parser），使用 `ScannerFs` 的内存实现：

```typescript
function createMemoryFs(files: ReadonlyMap<string, string>): ScannerFs {
  // 参见 prompt-asset-resolver.test.ts 中的完整实现
}
```

- 不读写真实文件系统
- fixture 数据定义为 `const` 字符串常量，包含完整 frontmatter + body
- 错误注入通过 fixture 内容变异实现，不通过 mock

### 6.2 Fake Adapter

```typescript
import { FakeAgentAdapter } from "@agentsflow/testing-kit";

const adapter = new FakeAgentAdapter({
  responseText: "test response",
  turnModeResponses: {
    plan: { finalText: "plan result", structuredOutput: { goal: "test" } },
    evaluate: { finalText: "score 0.9", structuredOutput: { score: 0.9, canComplete: true, reason: "ok" } },
  },
  evaluateScoreProgression: [0.3, 0.6, 0.9],
});
```

- 不得 mock `FlowScheduler`、`NodeExecutor`、`RunContext` 的内部方法
- 测试真实的 adapter → scheduler → executor 路径，用 `FakeAgentAdapter` 控制返回值

### 6.3 Golden Flow Fixture

```typescript
import { minimalFlow, multiAgentFlow } from "@agentsflow/testing-kit";
```

- 优先使用现有 golden fixture
- 新 fixture 必须是合法 `FlowDefinition`，包含 `extensions: { customNodeSpecs: [] }` 默认值
- 变量使用语义化命名：`minimalFlow`、`multiAgentFlow`、`planLoopFlow` 等

### 6.4 Fake SqlExecutor（local-store 专用）

```typescript
interface FakeSqlExecutor extends SqlExecutor {
  run(sql: string, params: unknown[]): void;
  get<T>(sql: string, params: unknown[]): T | undefined;
  all<T>(sql: string, params: unknown[]): T[];
}
```

- 使用内存数据结构（Map / Array）模拟 SQLite 行为
- 支持基本的 WHERE 过滤（用于 queryEvents 的 filter 测试）
- 不需要完整的 SQL 解析

### 6.5 全局注册表清理

```typescript
afterEach(() => {
  registry.unregister("custom-adapter");
  // 或
  registry.clear();
});
```

- 注册扩展后必须在 `afterEach` 中注销
- 缺少 cleanup 会造成跨测试污染
- 测试不依赖注册顺序

## 7. 反模式与禁止事项

| 反模式 | 正确做法 |
|--------|---------|
| mock `FlowScheduler` / `NodeExecutor` 内部方法 | `FakeAgentAdapter` 控制返回值，走真实执行路径 |
| 读写真实文件系统 | `createMemoryFs` 或 `FakeSqlExecutor` |
| UI 组件中直接调用 Electron IPC | `usePlatform()` + mock `window.agentsflow` |
| 使用 `__tests__/` 或 `test/` 目录 | 就近放置，后缀 `.test.ts` |
| 使用 `.spec.ts` 后缀 | 统一 `.test.ts` |
| 硬编码 API 基地址 | 相对路径 + 运行时 `origin` |
| 全局注册表测试缺少 `afterEach` cleanup | 必须 cleanup 中注销或 clear |
| flow fixture 缺少 `extensions: { customNodeSpecs: [] }` | 类型化 fixture 必须显式包含 schema 默认值 |
| Prompt 资产变更不补测试 | 必须补 parser + assembly + binding tests |
| 手改 `dist/` 或 `tsbuildinfo` | 只编辑 `src/` 源码 |

## 8. Store → Component 渲染管线测试规范

### 8.1 问题背景

2025-06 回归：用户从 chat 下拉选择不同 flow 时，flow 画布不刷新。

**根因**：`CenterWorkspace` 在 `<FlowEditorSurface>` 上缺少 `key={activeDoc.flowPath}`，导致 React 复用已有组件实例（含 `ReactFlowProvider` 及其内部 store），旧 flow 的 nodes/edges 无法被清除。

**测试缺口**：E2E 测试只验证了 store 层的 `openFlow`/`setActiveFlow` 行为，没有验证"activeFlowPath 变更 → 活跃文档切换 → 画布数据应刷新"的完整管线。由于 vitest 无法测试 React 组件渲染，需要在 store 层验证不变量，并通过代码规范约束组件层实现。

### 8.2 两条防线

| 防线 | 层级 | 验证内容 | 工具 |
|------|------|---------|------|
| **数据不变量** | Store | `activeFlowPath` 变更后，`documents.get(activeFlowPath)` 返回新 flow 的数据 | vitest |
| **组件 key 规范** | 组件 | 所有依赖 identity 切换的组件必须加 `key={identityProp}` | 代码审查 + 文档约束 |

### 8.3 数据不变量测试（Store 层）

**必须验证的场景**：

1. **切换 flow 时活跃文档数据更新**：打开 A、B 两个 flow，`setActiveFlow(A)` → `documents.get(activeFlowPath)` 的 flow graph 反映 A 的节点，而非 B 的
2. **key 标识一致性**：用于 `key` prop 的值（通常是 `flowPath`）在两个不同 flow 之间必须不同，且能唯一映射到正确的 `DocumentState`
3. **文档引用隔离**：不同 flowPath 对应的 `DocumentState` 必须是不同的对象引用（`expect(docA).not.toBe(docB)`）
4. **重复打开不创建重复文档**：对已打开的 flow 再次 `openFlow` 不应创建新的 `DocumentState` 条目

**测试模式**：

```typescript
describe("REGRESSION: flow switching updates active document data", () => {
  it("switching activeFlowPath changes the active document's flow graph", () => {
    const { openFlow, setActiveFlow } = useWorkspaceStore.getState();

    // 打开两个不同 flow（节点集合不同）
    openFlow(pathA, yamlA);
    openFlow(pathB, yamlB);

    // 切换到 A — documents.get(activeFlowPath) 必须反映 A 的节点
    setActiveFlow(pathA);
    const activeDoc = useWorkspaceStore.getState().documents.get(
      useWorkspaceStore.getState().activeFlowPath!,
    );
    expect(activeDoc?.flow?.graph.nodes.map((n) => n.nodeId))
      .toEqual(["node-a1"]);

    // 切换回 B — 必须反映 B 的节点
    setActiveFlow(pathB);
    const docB = useWorkspaceStore.getState().documents.get(
      useWorkspaceStore.getState().activeFlowPath!,
    );
    expect(docB?.flow?.graph.nodes.map((n) => n.nodeId))
      .toEqual(["node-b1", "node-b2"]);
  });
});
```

### 8.4 组件 key 规范（代码约束）

**规则**：任何渲染 per-document 内容的组件，当其 identity 属性（如 `flowPath`）变化时，必须通过 `key` prop 强制 React 重建组件树。

**适用场景**：

| 组件 | key 值 | 原因 |
|------|--------|------|
| `<FlowEditorSurface>` | `key={flowPath}` | 内含 `<ReactFlowProvider>`，其内部 store 不会因 props 变化自动重置 |
| 其他包含第三方 provider 的 per-document 容器 | `key={identityProp}` | 第三方库通常在 constructor/init 中缓存状态，不会响应 prop 变化 |

**判断标准**：如果组件内含以下任一模式，必须加 `key`：
- 第三方 context provider（如 `ReactFlowProvider`、`QueryClientProvider`）
- `useRef` + `useEffect` 初始化的持久状态
- `useState` 的初始值依赖外部的 identity prop

**反模式**：试图通过 `useEffect(() => { resetState() }, [identityProp])` 来同步状态 — 这要求组件正确处理"部分更新"，极易遗漏边角情况。`key` 方式更安全，因为它让 React 走完整的 unmount → mount 路径。

### 8.5 回归测试命名约定

回归测试使用 `REGRESSION:` 前缀，并在注释中说明根因：

```typescript
// REGRESSION: chat 选择 flow 时 flow 页面不刷新
// Root cause: CenterWorkspace lacked key={flowPath} on FlowEditorSurface
it("REGRESSION: switching activeFlowPath changes the active document's flow graph", () => {
  // ...
});
```

### 8.6 需求变更时的测试缺口检查

每次新增或修改 UI 功能时，必须检查：

1. **Store 数据管线**：新的 store 字段/方法是否有对应的 E2E 测试？
2. **组件 identity 切换**：新组件是否在 identity prop 变化时需要 `key`？
3. **第三方库状态缓存**：组件内是否使用了会在 prop 变化时不自动重置的第三方状态？
4. **跨 flow 切换**：如果功能涉及 per-flow 状态，是否测试了 flow 切换后的数据隔离？

如果任何一个答案为"是"或"不确定"，必须补测试或补 `key`。

## 9. 测试用例模板

### 8.1 Schema 验证测试

```typescript
import { describe, expect, it } from "vitest";
import { SomeSchema } from "./some-schema.js";

describe("SomeSchema", () => {
  it("should accept valid input", () => {
    const result = SomeSchema.parse({ requiredField: "value" });
    expect(result.requiredField).toBe("value");
  });

  it("should fill defaults for optional fields", () => {
    const result = SomeSchema.parse({ requiredField: "value" });
    expect(result.optionalField).toEqual([]);
  });

  it("should reject invalid enum values", () => {
    expect(() => SomeSchema.parse({ requiredField: "value", enumField: "invalid" })).toThrow();
  });

  it("should preserve unknown fields via passthrough", () => {
    const result = SomeSchema.parse({ requiredField: "value", customExtension: true });
    expect((result as any).customExtension).toBe(true);
  });
});
```

### 8.2 类/模块行为测试

```typescript
import { describe, expect, it } from "vitest";
import { SomeClass } from "./some-class.js";

describe("SomeClass", () => {
  describe("someMethod", () => {
    it("should return expected result for valid input", () => {
      const instance = new SomeClass();
      expect(instance.someMethod("input")).toBe("expected");
    });

    it("should throw for missing required parameter", () => {
      const instance = new SomeClass();
      expect(() => instance.someMethod("")).toThrow(/missing/i);
    });
  });
});
```

### 8.3 集成测试（Scheduler + FakeAdapter）

```typescript
import { describe, expect, it } from "vitest";
import { FlowScheduler } from "./scheduler/flow-scheduler.js";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";
import { minimalFlow } from "@agentsflow/testing-kit";

describe("FlowScheduler with FakeAgentAdapter", () => {
  it("should complete a minimal flow run", async () => {
    const adapter = new FakeAgentAdapter({ responseText: "done" });
    const resolver = (kind: string) => kind === "fake" ? adapter : undefined;
    const scheduler = new FlowScheduler(resolver);

    const events: AgentEvent[] = [];
    scheduler.events.on("*", (e) => events.push(e));

    const runId = await scheduler.startRun(minimalFlow, { userPrompt: "test" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const ctx = scheduler.getRunState(runId);
    expect(ctx?.state).toBe("completed");
    expect(events.some((e) => e.eventType === "run_completed")).toBe(true);
  });
});
```

### 8.4 全局注册表测试

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SomeRegistry } from "./some-registry.js";

describe("SomeRegistry", () => {
  let registry: SomeRegistry;

  beforeEach(() => {
    registry = new SomeRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  it("should register and resolve an adapter", () => {
    registry.register(/* ... */);
    expect(registry.has("custom")).toBe(true);
  });
});
```

### 8.5 E2E 需求测试

```typescript
import { describe, expect, it, afterEach } from "vitest";
import { useWorkspaceStore } from "./workspace-store.js";
import { useRuntimeStore } from "./runtime-store.js";
import { FakeAgentAdapter } from "@agentsflow/testing-kit";
import { registerRuntimeAdapterExtension, unregisterRuntimeAdapterExtension } from "@agentsflow/prompt-asset-resolver";

describe("Requirement X: <requirement title>", () => {
  afterEach(() => {
    unregisterRuntimeAdapterExtension("fake");
    useRuntimeStore.getState().reset();
  });

  it("should <expected behavior>", () => {
    registerRuntimeAdapterExtension({
      adapterKind: "fake",
      adapter: new FakeAgentAdapter(),
    });

    const store = useWorkspaceStore.getState();
    // ... 操作 + 断言
  });
});
```
