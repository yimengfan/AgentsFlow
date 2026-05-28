# 缺陷台账

> 本文档是 AgentsFlow 当前活跃产品缺陷的动态维护源。
> 稳定方法论见 `docs/prd/product-feature-analysis-methodology.md`；总 PRD 只引用这里已经确认的活跃 P0/P1 摘要。

## 1. 使用规则

- 只有已经具备代码锚点和验证锚点的问题，才能进入活跃缺陷台账。
- 每次新增、修复、降级、转 roadmap 或归档，都必须更新状态和“下一步”。
- 每条缺陷只记录一个主问题，不把多个无关问题混成一个大条目。

## 2. 状态与等级

### 状态

- `Discovered`: 已确认存在，但尚未正式排期。
- `Triaged`: 已确定等级、根因层与推荐修复类别。
- `Planned`: 已进入计划，等待执行。
- `In Fix`: 正在处理。
- `Validated`: 修复已通过验证，等待关闭记录。
- `Resolved`: 已关闭并同步相关文档。
- `Archived`: 保留历史，不再作为当前活跃问题。

### 等级

- `P0`: 主路径阻断、结果错误或平台主链路失效。
- `P1`: 用户可达但行为不完整、语义漂移或配置保真度不足。
- `P2`: 不影响正确性，但造成显著使用摩擦或理解成本。

## 3. 当前活跃缺陷概览

| ID | 等级 | 状态 | 类型 | 摘要 |
| --- | --- | --- | --- | --- |
| AF-D001 | P0 | Discovered | 平台偏差 / 闭环断裂 | Desktop 入口未注入平台适配，Workbench 主路径在桌面端不闭环 |
| AF-D002 | P0 | Discovered | 平台偏差 / 闭环断裂 | Web 适配层期望的保存与校验接口未被 dev server 落地 |
| AF-D003 | P1 | Discovered | 语义漂移 | Agent 节点 `turnMode` 选项与 schema/runtime 实际语义不一致 |
| AF-D004 | P1 | Discovered | 伪闭环 | 全局设置面板存在，但默认模型 / transport / 审批策略未进入默认创建链路 |
| AF-D005 | P1 | Discovered | 伪闭环 / 体验债 | Inspector 对 `multiselect` 等高级参数没有结构化编辑能力，配置保真度不足 |
| AF-D006 | P2 | Discovered | 体验债 | Workspace 视图已暴露在导航中，但内容仍是占位态 |

## 4. 当前活跃缺陷详情

### AF-D001 Desktop 平台入口未闭环

- 类型: 平台偏差 / 闭环断裂
- 严重度: P0
- 状态: Discovered
- 所属旅程 / 模块: Desktop 启动 -> Workbench -> 平台 API
- 触发条件: 在 Desktop renderer 中加载工作台
- 预期结果: Workbench 通过 `PlatformProvider` 获取 Electron 平台能力，文件、Flow、运行时链路可用
- 实际结果: [apps/desktop/src/renderer/index.tsx](../../apps/desktop/src/renderer/index.tsx) 直接渲染裸 `<Workbench />`
- 根因层: app 入口 / platform abstraction
- 代码锚点:
  - `apps/desktop/src/renderer/index.tsx`
  - `apps/web/src/index.tsx`
- 验证锚点:
  - Desktop smoke：`pnpm dev:desktop`
  - 平台集成检查：Electron renderer 是否可调用 `usePlatform()` 路径
- 推荐修复类别: 平台链路补齐
- PRD / Roadmap 关联: O4 / KR4.1 / KR4.2
- 下一步: 对齐 Desktop 与 Web/Studio 的平台注入方式，并补 Desktop smoke 记录

### AF-D002 Web 保存与校验接口 contract 未落地

- 类型: 平台偏差 / 闭环断裂
- 严重度: P0
- 状态: Fixing
- 所属旅程 / 模块: Web Workbench -> Flow save / validate
- 触发条件: Web 模式下调用 `platform.flow.save()` 或 `platform.flow.validate()`
- 预期结果: HTTP 适配层与 dev server 暴露同一套保存 / 校验 contract
- 实际结果: [packages/platform-adapter/src/http-adapter.ts](../../packages/platform-adapter/src/http-adapter.ts) 期望 `PUT /flows/:flowPath` 与 `POST /flows/validate`，但 [apps/web/vite.config.ts](../../apps/web/vite.config.ts) 当前只实现了读取与列表相关接口
- 根因层: platform adapter / web dev server contract
- 代码锚点:
  - `packages/platform-adapter/src/http-adapter.ts`
  - `apps/web/vite.config.ts`
- 验证锚点:
  - Web smoke：`pnpm dev:web`
  - Flow save path manual / integration verification
- 推荐修复类别: 契约对齐
- PRD / Roadmap 关联: O1 / KR1.4，O4 / KR4.2
- 下一步: 已在 vite.config.ts 中补充 `PUT /api/flows/:flowPath` 和 `POST /api/flows/validate` 路由；需验证完整链路

### AF-D003 Agent `turnMode` 语义漂移

- 类型: 语义漂移
- 严重度: P1
- 状态: Discovered
- 所属旅程 / 模块: Agent 配置 -> Inspector -> runtime execution
- 触发条件: 用户在 Inspector 中编辑 `agent.main` / `agent.sub` 的 `turnMode`
- 预期结果: NodeSpec、schema、starter flow、runtime 对 `turnMode` 使用相同枚举和相同语义
- 实际结果: [packages/node-spec-registry/src/nodes/agent-main.ts](../../packages/node-spec-registry/src/nodes/agent-main.ts) 和 [packages/node-spec-registry/src/nodes/agent-sub.ts](../../packages/node-spec-registry/src/nodes/agent-sub.ts) 暴露 `single/multi`，而 starter flow、schema 与测试锚点使用 `normal/plan/evaluate/summarize`
- 根因层: node spec / schema / runtime consistency
- 代码锚点:
  - `packages/node-spec-registry/src/nodes/agent-main.ts`
  - `packages/node-spec-registry/src/nodes/agent-sub.ts`
  - `packages/ui-flow/src/store/workspace-store.ts`
  - `packages/flow-schema/src/schema/agents-flow-assets.ts`
- 验证锚点:
  - `packages/ui-flow/src/store/requirements-e2e.test.ts`
  - NodeSpec contract tests（待补更精确覆盖）
- 推荐修复类别: 契约对齐
- PRD / Roadmap 关联: O3 / KR3.3
- 下一步: 统一枚举来源与 Inspector 表达，避免生成错误配置

### AF-D004 全局设置未进入默认创建链路

- 类型: 伪闭环
- 严重度: P1
- 状态: Discovered
- 所属旅程 / 模块: Settings -> create flow / agent defaults
- 触发条件: 用户修改默认模型、默认 transport、默认审批策略后，新建 Flow 或使用默认 Agent 配置
- 预期结果: 全局设置能影响默认创建结果，而不是停留在孤立面板
- 实际结果: [packages/ui-flow/src/store/settings-store.ts](../../packages/ui-flow/src/store/settings-store.ts) 与 [packages/ui-flow/src/components/global-settings.tsx](../../packages/ui-flow/src/components/global-settings.tsx) 仅维护本地状态；[packages/ui-flow/src/store/workspace-store.ts](../../packages/ui-flow/src/store/workspace-store.ts) 的 starter YAML 仍然硬编码默认值
- 根因层: settings store / creation defaults / product closure
- 代码锚点:
  - `packages/ui-flow/src/store/settings-store.ts`
  - `packages/ui-flow/src/components/global-settings.tsx`
  - `packages/ui-flow/src/store/workspace-store.ts`
- 验证锚点:
  - Settings store tests
  - Create flow / default propagation tests（待补更直接覆盖）
- 推荐修复类别: 闭环补齐
- PRD / Roadmap 关联: O1 / KR1.3，O4 / KR4.1
- 下一步: 把全局默认配置接入创建链路和默认 Agent hydration

### AF-D005 Inspector 高级参数编辑保真度不足

- 类型: 伪闭环 / 体验债
- 严重度: P1
- 状态: Discovered
- 所属旅程 / 模块: Inspector -> Agent config editing
- 触发条件: 用户编辑 `multiselect`、记忆策略、工具策略等高级参数
- 预期结果: 参数编辑器应与参数类型匹配，保证配置语义可读、可写、可回显
- 实际结果: [packages/ui-flow/src/components/node-inspector.tsx](../../packages/ui-flow/src/components/node-inspector.tsx) 对 `multiselect` 未提供结构化控件，落回普通文本输入，导致配置弱约束、弱可解释
- 根因层: UI form fidelity
- 代码锚点:
  - `packages/ui-flow/src/components/node-inspector.tsx`
  - `packages/node-spec-registry/src/nodes/agent-main.ts`
  - `packages/node-spec-registry/src/nodes/agent-sub.ts`
- 验证锚点:
  - `packages/ui-flow/src/store/requirements-e2e.test.ts`
  - 未来 Inspector param-fidelity tests
- 推荐修复类别: 结构化编辑增强
- PRD / Roadmap 关联: O1 / KR1.3，O3 / KR3.3
- 下一步: 为 `multiselect`、高级参数组和策略字段补结构化编辑与回显约束

### AF-D006 Workspace 视图仍为占位态

- 类型: 体验债
- 严重度: P2
- 状态: Discovered
- 所属旅程 / 模块: Activity Bar -> Workspace view
- 触发条件: 用户点击 Workspace 视图
- 预期结果: 进入有明确价值的工作区管理界面，或该入口不应对外暴露
- 实际结果: [packages/ui-flow/src/components/workspace-pane.tsx](../../packages/ui-flow/src/components/workspace-pane.tsx) 仅显示 “Workspace settings coming soon”
- 根因层: navigation exposure / incomplete product surface
- 代码锚点:
  - `packages/ui-flow/src/components/workspace-pane.tsx`
  - `packages/ui-flow/src/components/workbench.tsx`
- 验证锚点:
  - Web / Desktop manual navigation smoke
- 推荐修复类别: 路由清理或产品化补齐
- PRD / Roadmap 关联: O1 / KR1.1
- 下一步: 决策是暂时下线入口，还是定义最小可用工作区管理范围

## 5. 维护要求

- 每次完成缺陷复扫后，至少更新一次“概览表 + 受影响条目”。
- 每次缺陷修复完成后，必须同步更新状态、验证锚点与关闭说明。
- 每次 PRD §8 或 roadmap 变化后，回查本台账是否仍然是源数据。
