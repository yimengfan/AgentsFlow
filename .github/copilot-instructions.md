# AgentsFlow — Agent 工作流控制

此文件用于约束 AI agent 在本仓库中的工作方式、验证门禁和交付标准。

稳定的架构细节保存在 `docs/`；这里聚焦“如何工作”，不重复完整 ADR 或规范正文。

## 1. 文档定位

- 这是 agent 的流程控制文档，不是完整架构说明书。
- agent 的默认目标是：从具体锚点出发，做最小必要改动，先做窄验证，再做仓库级验证，最后给出带风险说明的交付结果。
- 任何会改变契约、运行时绑定、Prompt 资产、平台边界或用户可见行为的修改，都必须经过测试与文档同步检查。

## 2. 阅读与任务路由

| 场景 | 首选来源 |
| ---- | -------- |
| 项目概览与快速开始 | `README.md` |
| 文档地图 | `docs/README.md` |
| 人类贡献流程 | `CONTRIBUTING.md` |
| 维护者与运维指南 | `MAINTENANCE.md` |
| 产品缺陷识别 / 复扫 | `docs/prd/product-feature-analysis-methodology.md` |
| 活跃缺陷与状态 | `docs/prd/defect-registry.md` |
| 功能进化 / 深度优化 | `docs/prd/agentsflow-prd.md` |
| Workbench 壳层约束 | `docs/adr/001-workbench-layout.md` |
| Flow 运行时模型 | `docs/adr/002-flow-runtime-extension.md` |
| 节点与运行时契约 | `docs/specs/001-flow-node-contract.md` |
| 运行时绑定路径 | `docs/specs/002-runtime-binding.md` |
| Prompt 资产模型 | `docs/specs/003-agents-flow-repo-spec.md` |

任务路由规则：

- 先从最具体的锚点开始：当前文件、失败命令、失败测试、目标符号、相邻实现面。
- 首次编辑前，必须能说清一条局部假设，以及一条能推翻该假设的廉价检查。
- 涉及 flow 语义、节点行为、运行时绑定时，先看 ADR 002 和 specs 001/002。
- 涉及 `.agents-flow/`、`agentRef`、Prompt 装配时，先看 spec 003。
- 涉及 Workbench 布局、面板、侧栏或 React Flow 上下文时，先看 ADR 001。
- 涉及缺陷识别、功能复扫、闭环分析时，先看 `docs/prd/product-feature-analysis-methodology.md`，再看 `docs/prd/defect-registry.md`，最后再决定是否需要改 PRD。
- 涉及功能进化或深度优化时，先判断这是“闭环增强”还是“范围扩展”；前者按方法论执行，后者再进入 PRD 范围变更。
- 任何代码任务结束前，都必须检查是否需要同步更新 PRD 文档、缺陷台账、测试规范或文档地图；不能只改实现不回填文档。

## 3. 标准工作流

### 阶段 A：接单与定位

- 从具体锚点开始，不要先做大范围漫游式搜索。
- 在第一次编辑前，形成一条可证伪的局部假设和一条最便宜的区分性检查。
- 优先靠近真实控制点：拥有该行为的 store、scheduler、adapter、resolver、平台边界，而不是只看转发层。

### 阶段 B：最小化变更

- 只编辑 `src/` 源码；不要手改 `dist/`、`tsbuildinfo` 等生成物。
- 优先修复根因，不做下游绕过式补丁。
- 不顺手修复无关问题，不改变无关公共 API，不重排无关代码。

### 阶段 C：首次验证

- 第一次实质性编辑之后，下一步必须是针对该改动切片的窄验证。
- 优先顺序：失败行为检查 -> 窄测试 -> 窄 typecheck/lint -> 仓库级验证。
- 在首次验证返回前，不要继续扩 scope、追加第二片改动，除非当前验证被明确阻塞。

### 阶段 D：扩展验证

- 如果改动触达共享契约、跨包边界或用户可见行为，必须把验证升级到仓库级。
- 如果变更影响 Web、Desktop 或运行时链路，必须补相应 smoke / E2E 流程。

### 阶段 E：收尾交付

- 检查测试、诊断、文档、风险说明是否齐全。
- 最终回复必须明确三件事：做了什么、验证了什么、还有什么未完成或存在风险。

## 4. 仓库职责边界

- AgentsFlow 是 pnpm monorepo，包含 `apps/desktop`、`apps/web`、`apps/studio` 与 `packages/*`。
- `apps/desktop`、`apps/web`、`apps/studio` 都渲染 `<Workbench />`；平台差异必须收敛在 `@agentsflow/platform-adapter` 之后。
- `@agentsflow/ui-flow` 负责共享 React Workbench、Zustand stores 和 runtime adapter registry。
- `@agentsflow/flow-engine` 负责 scheduler、node execution、run context、event emission。
- `@agentsflow/flow-schema` 是规范性 schema；`@agentsflow/node-spec-registry` 负责内置节点定义。
- `@agentsflow/platform-adapter` 负责 Electron IPC 与 HTTP 适配边界。
- `@agentsflow/prompt-asset-resolver` 负责 `.agents-flow/` 解析与 Prompt 装配。
- `@agentsflow/pi-mono-runtime` 负责 transport-driven adapter；`@agentsflow/testing-kit` 提供 `FakeAgentAdapter` 与 golden flow fixtures。
- 所有构建、验证、开发命令默认从仓库根目录执行。

## 5. 实现门禁

### 构建与源码边界

- 所有 packages 都只使用 ESM，本地导入必须包含 `.js`。
- library packages 使用 `moduleResolution: Node16`；Vite 应用入口使用 `bundler`。
- TypeScript 采用 strict 模式；不要给 optional properties 显式赋 `undefined`。
- DTO 和公开数据结构使用 `readonly` 属性与数组。
- 修改依赖图、workspace 或脚手架后，需要同步处理 `package.json`、`tsconfig` 和项目引用。

### 平台抽象

- UI 代码必须通过 `PlatformProvider` 与 `usePlatform()` 访问平台能力。
- 不要在 UI 组件中直接调用 Electron IPC 或原始 HTTP。
- 新增平台能力时，必须检查完整链路：
  1. `packages/shared-contracts/src/types/ipc-channels.ts`
  2. `apps/desktop/src/main/app.ts`
  3. `apps/desktop/src/main/preload.ts`
  4. `packages/platform-adapter/src/platform-api.ts`
  5. `packages/platform-adapter/src/electron-adapter.ts`
  6. `packages/platform-adapter/src/http-adapter.ts`

### Workbench 壳层

- 所有应用入口都必须渲染 `<Workbench />`。
- `<Workbench>` 是唯一可以拥有 `100vh` × `100vw` 的组件。
- 不要在 Workbench 布局树内部使用 `position: fixed` 或 `position: absolute`。
- 壳层尺寸和颜色必须来自 `workbench-tokens.ts`。
- 使用 `react-resizable-panels` 时，调用 `collapse()` / `expand()` 前必须通过 `ImperativePanelHandle` 与 `isCollapsed()` 做保护判断。
- 不要在 Workbench `PanelGroup` 上使用 `autoSaveId`。
- 左侧边栏内容必须通过 `activeLeftView` 和 `renderLeftSidebarContent(...)` 切换。
- 使用 `useReactFlow()` 的组件必须包裹在 `<ReactFlowProvider>` 中。

### Flow 运行时

- `packages/flow-schema/src/schema/flow-definition.ts` 是规范性 flow schema。
- 运行时绑定链路为：`node.agentId -> agentDef.agentId -> adapterKind -> runtime adapter registry -> AgentAdapter -> transport`。
- `layout.nodeBindings` 是描述性元数据，不是可执行真实来源。
- 运行时状态不得回写到 YAML。
- Session 复用按 `runId + agentId` 建立键，而不是按 node instance。
- 新 provider 集成应扩展 runtime adapter registry，而不是让 core packages 直接耦合厂商实现。

### Prompt 资产层

- `.agents-flow/` 仓库资产遵循 `docs/specs/003-agents-flow-repo-spec.md`。
- `node.agentRef` 通过 prompt asset manifest 解析；`node.agentId` 是 inline `agentDefs` 的回退路径。
- Prompt 装配顺序为：`global-system-prompt -> instructions -> skills -> agent body -> node config -> run input`。

### 测试约束

详细展开见 `docs/testing-supplementation.md`；此处为精简规则。

**分层与优先级**：
- 测试分四层：单元 → 集成 → E2E 需求 → Smoke；优先从单元开始，无法覆盖跨模块交互时升级。
- P0 包（`flow-schema`、`agent-contracts`、`flow-engine`）当前零测试，任何改动必须先补测试。
- P1 包（`node-spec-registry`、`agent-registry`、`local-store`）改动需覆盖注册/查询/状态关键路径。

**门禁**：
- 新增 public export 必须有对应测试（纯 UI / Context Provider / 类型重导出除外）。
- Bug 修复必须先写复现测试再修。
- Schema / 契约 / DTO 变更必须同步更新验证测试及下游消费者。
- E2E 需求测试不可跳过——无 E2E 覆盖的需求视为未完成。

**命名与风格**：
- 测试文件就近放置，后缀 `.test.ts`；不用 `.spec.ts`、`__tests__/` 或 `test/` 目录。
- `describe` 嵌套：顶层 = 模块/类名，内层 = 方法/特性，`it` 用 "should ... when ..." 格式。
- 使用 vitest 显式 `import { describe, expect, it } from "vitest"`；不用全局 API。
- 被测模块用相对路径 + `.js` 后缀；类型导入用 `import type`。

**契约测试**：
- 公开 API 即契约：所有 export 必须至少有一个测试验证可导入性和签名行为。
- Schema 即规范：Zod schema 测试验证约束与 spec 一致，不是测 Zod 本身。
- Adapter 契约：所有 `AgentAdapter` 实现须通过 metadata + createSession + runTurn + dispose 测试。

**必测场景**：
- 运行时绑定路径（6 个）：正常路径、缺失 agentId、未知 agentDef、未知 adapterKind、session 复用、prompt 资产绑定。
- Prompt 装配顺序（5 个）：完整 6 层装配、去重、优雅降级、source 归因、globalSystemPrompt 过滤。
- Store → Component 渲染管线（4 个）：flow 切换后活跃文档数据更新、key 标识一致性、文档引用隔离、重复打开不创建重复文档。详见 `docs/testing-supplementation.md` §8。

**工具与隔离**：
- 迭代阶段先跑最窄的 package 级测试，收尾前再升级到仓库级验证。
- runtime 和 store 测试使用 `@agentsflow/testing-kit`；优先真实 scheduler/store + `FakeAgentAdapter`，不要 mock `FlowScheduler` 或 `NodeExecutor` 内部。
- Runtime adapter registration 是全局的；测试里注册扩展后必须在 cleanup 中注销。
- 类型化 flow fixtures 必须显式包含 schema 默认值，尤其是 `extensions: { customNodeSpecs: [] }`。
- 文件系统测试用 `createMemoryFs`；`local-store` 用 `FakeSqlExecutor`；不读写真实文件系统。
- `platform-adapter` 变更必须通过 mock `window.agentsflow` 或 `fetch` 测边界；UI 组件仍必须使用 `usePlatform()`。
- `ui-flow` 变更应先从 store-level tests 开始；涉及 Workbench、preview 或平台交互时还需要 Web smoke。
- `prompt-asset-resolver` 或 `.agents-flow/` 资产变更必须补 parser 和 prompt assembly tests，覆盖 global prompt、instruction、skill、agent body 顺序。

## 6. 验证阶梯

执行 Node 命令前先启用 nvm：

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

标准验证阶梯：

1. 先运行最窄的相关验证。
2. 触达共享边界或准备交付时，升级到仓库级验证。
3. 触达 UI / Desktop / 平台路径时，追加对应 smoke / E2E 流程。

标准命令：

- 窄测试：`pnpm --filter @agentsflow/<package> run test`
- 窄 typecheck：`pnpm --filter @agentsflow/<package> run typecheck`
- 仓库级 typecheck：`pnpm typecheck`
- 仓库级 build：`pnpm build`
- 仓库级 test：`pnpm test`
- Web 开发验证：`pnpm dev:web`
- Desktop 开发验证：`pnpm dev:desktop`

默认规则：

- 共享包、公共契约、跨包边界改动，结束前至少执行一次完整的 `pnpm typecheck`、`pnpm build`、`pnpm test`。
- UI 变更除命令验证外，还应完成 `pnpm dev:web` 的页面渲染与控制台检查。
- 修改 package 图、脚手架或依赖后，需要运行 `pnpm install` 或在回复中说明为何未执行。

## 7. E2E 标准流程

仓库使用 Vitest 驱动的 E2E 验证测试，位于 `packages/ui-flow/src/store/requirements-e2e.test.ts`，直接验证 store / resolver 层行为，不依赖浏览器渲染。

**强制规范：每个功能需求完成后，必须编写对应的 E2E 验证测试，依次检查需求列表是否全部完成。** 这是一条不可跳过的门禁规则——没有 E2E 测试覆盖的需求视为未完成。

E2E 验证测试的编写标准：

1. 每条需求对应一个 `describe` 块，内含多个 `it` 用例覆盖主路径和边界。
2. 测试直接操作 Zustand store（`useWorkspaceStore.getState()` / `useRuntimeStore.getState()`）和 resolver（`assemblePromptPackage`），不依赖 DOM。
3. 运行时测试使用 `FakeAgentAdapter` + `registerRuntimeAdapterExtension`，`afterEach` 中必须 `unregisterRuntimeAdapterExtension` 并重置 store。
4. 验证命令：`pnpm --filter @agentsflow/ui-flow run test`。

### Web Workbench Smoke E2E

适用范围：`apps/web`、`ui-flow`、Workbench 布局、platform HTTP 路径、浏览器侧运行时交互。

1. 运行 `pnpm dev:web`。
2. 确认页面可在 `http://localhost:3000/` 打开，且 `<Workbench />` 正常渲染。
3. 确认三处面板切换按钮、左侧 activity bar 视图切换、右侧 tab 切换没有明显回归。
4. 确认没有 runtime console errors。
5. Flow 相关 Web 检查应优先使用本地 stores、`FakeAgentAdapter` 或本地 runtime 流程，不要把 `/api/flows` 当成稳定后端前提。

### Desktop Smoke E2E

适用范围：`apps/desktop`、Electron 启动链、preload、IPC、platform Electron 路径。

1. 运行 `pnpm dev:desktop`。
2. 确认共享包构建成功，Electron 主进程与 preload 能被 bundling，renderer Vite dev server 正常启动。
3. 确认 Electron 成功拉起并渲染 Workbench。
4. 确认 preload 暴露的桌面平台路径没有明显失效，例如窗口能正常加载而不是退回错误页。

### Runtime / Contract E2E

适用范围：`flow-schema`、`shared-contracts`、`flow-engine`、`prompt-asset-resolver`、runtime adapter registry、`pi-mono-runtime`。

1. 先运行对应 package 的窄测试或窄 typecheck。
2. 需要时使用 `@agentsflow/testing-kit` 的 `FakeAgentAdapter` 与 golden flow fixtures 覆盖真实执行路径。
3. 结束前运行 `pnpm typecheck`、`pnpm build`、`pnpm test`。
4. 对绑定或 Prompt 相关改动，额外确认运行时绑定链路、Prompt 装配顺序、session reuse 规则没有被破坏。

### Build / Release Smoke E2E

适用范围：构建脚本、workspace 拓扑、Electron 打包、发布相关改动。

1. 运行 `pnpm build`。
2. 运行 `pnpm dev:web`，确认 Web 开发模式能启动。
3. 运行 `pnpm dev:desktop`，确认桌面开发模式能启动。
4. 如果修改触达桌面打包链路，再执行 `cd apps/desktop && pnpm dist` 或在回复中明确说明未执行原因。

阻塞处理规则：

- 如果 E2E 因环境问题失败，必须记录失败命令、退出码、失败阶段和替代验证。
- 不要把“命令没跑”写成“命令通过”。

## 8. 任务完成前检查清单

- [ ] 改动范围仍与用户请求一致，没有顺手修复无关问题。
- [ ] 只修改了应修改的源码与文档，没有手改 `dist/`、`tsbuildinfo` 等生成产物。
- [ ] 已为触达的代码路径补充对应层级测试，或已明确说明为何当前无法补测。
- [ ] **已为需求编写 E2E 验证测试（`requirements-e2e.test.ts`），依次检查需求列表是否全部完成。**
- [ ] 已完成第一次窄验证，且结果与当前改动切片对应。
- [ ] 需要仓库级验证的任务，已执行 `pnpm typecheck`、`pnpm build`、`pnpm test`，或已明确记录阻塞。
- [ ] 需要 Web Smoke E2E 的任务，已执行 `pnpm dev:web` 并检查页面渲染与控制台。
- [ ] 需要 Desktop Smoke E2E 的任务，已执行 `pnpm dev:desktop` 并确认 Electron 启动链路。
- [ ] 如修改了依赖、workspace、脚手架或打包链路，已执行相应安装 / build / dist 流程，或已说明未执行原因。
- [ ] 改动文件没有新增 diagnostics、类型错误、lint 问题或明显的调试残留，如临时日志、注释掉的旧代码、试验文件。
- [ ] 对 schema、契约、运行时绑定、Prompt 资产或用户可见行为的修改，相关文档或说明已同步更新。
- [] Git commit（不 push）。
log 内容 （使用英文）：
```
修改任务：<简要描述改动内容> - {Agent}/{模型名}
[ ] 修改列表 1
[ ] 修改列表 2
[ ] ...
验证列表:
[ ] 验证列表 1
[ ] 验证列表 2
```
- [ ] 最终回复会明确写出：做了什么、验证了什么、未完成或有风险的部分是什么、提交 sha。

## 9. 附录：常见脚手架变更

### 新增 package

1. 在 `packages/` 下创建 package。
2. 添加 `package.json`，并设置 `"type": "module"` 与 workspace dependencies。
3. 添加 `tsconfig.json`，继承根级 base config。
4. 从 `src/index.ts` 导出。
5. 在根级 `tsconfig.json` 中添加 project reference。
6. 运行 `pnpm install`。

### 新增 app

1. 在 `apps/` 下创建 app。
2. 使用 `"type": "module"`。
3. 为 Vite 入口使用 `bundler` module resolution。
4. 添加带有 workspace aliases 的 Vite config。
5. 用 `PlatformProvider` 包裹应用入口。
6. 运行 `pnpm install`。

## 10. 常见陷阱

- 缺少 `.js` import 扩展名会导致 `ERR_MODULE_NOT_FOUND`。
- `pnpm --filter` 必须出现在 `-r` 之前，取反 filter 必须加引号。
- `exactOptionalPropertyTypes` 表示 `foo?: string` 和 `foo: string | undefined` 不等价。
- `react-resizable-panels` 的 `autoSaveId` 会与命令式 panel 控制冲突。
- `layout.nodeBindings` 不驱动执行，其 overrides 也不会自动合并进 runtime state。
- Runtime adapter registration 在测试进程内是全局状态；缺少 cleanup 会造成跨测试污染。
- Web dev mode 不应被当成稳定的真实 `/api/flows` 后端；flow 相关 Web 验证应优先使用本地 stores 和 fakes。
- 浏览器侧 HTTP 适配应使用相对路径和运行时 `origin`，不要硬编码 API 基地址。
- 对壳层尺寸或颜色进行硬编码会偏离 Workbench token system。
- 渲染 per-document 内容的组件（如 `<FlowEditorSurface>`）在 identity prop 变化时必须加 `key={identityProp}`，否则 React 复用组件实例会导致第三方 provider（如 `ReactFlowProvider`）的内部状态不重置。详见 `docs/testing-supplementation.md` §8.4。
- 保持此文件简洁：稳定的设计理由放到 ADR，可执行约束放到 specs，新增文档时同步更新 `docs/README.md`。
