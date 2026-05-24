# 产品功能缺陷扫描方法论

> 本文档定义 AgentsFlow 产品功能缺陷的核心扫描机制，作为 PRD 的核心补充。
> 扫描结果直接驱动 PRD §8 "当前关键缺口" 和 E2E 测试规格的更新。

## 1. 文档定位

- **定位**: PRD 的核心扫描机制，不是架构说明书或测试计划
- **目标**: 建立系统化的缺陷发现、分级和追踪框架，防止功能退化
- **更新规则**: 每次功能迭代后必须重新执行扫描，更新 §8 和测试规格

## 2. 三维扫描框架

产品功能缺陷扫描从三个维度交叉检查，确保覆盖"契约定义了但 UI 没暴露"、"交互不完整"、"跨模块不一致"三类问题。

### 维度 1: Contract→UI Gap（契约到 UI 的差距）

**定义**: Schema / Contract / Spec 中定义了能力，但 UI 层未暴露或未正确连接。

**扫描方法**:
1. 遍历 `AgentDefSchema` 的所有字段
2. 遍历 `NodeSpec.params` 中定义的参数
3. 遍历 `PlatformApi` 的所有方法
4. 对每个字段/参数/方法，检查 UI 组件是否渲染了对应控件
5. 检查控件值变更是否正确回写到 store

**检查清单**:

| 契约来源 | 检查目标 | UI 锚点 |
|----------|----------|---------|
| `AgentDefSchema.modelProfile` | model, systemPrompt, temperature, maxTokens | NodeInspector `renderParamField` |
| `AgentDefSchema.toolPolicy` | allowedCapabilities, blockedTools, approvalRequirement | NodeInspector params |
| `AgentDefSchema.memoryPolicy` | visibleScopes, writableScopes, maxItems, maxBytes | NodeInspector params |
| `AgentDefSchema.subagentPolicy` | allowedAgents, switchModes, returnStrategy, maxDelegations | NodeInspector params |
| `AgentDefSchema.timeouts` | turnMs, sessionMs | NodeInspector params |
| `AgentDefSchema.budgets` | maxTokens, maxCostUsd, maxSteps, maxWallClockMs | NodeInspector params |
| `AgentDefSchema.outputKind` | "text"\|"plan"\|"score" | NodeInspector params |
| `PlatformApi.workspace.createFile` | 文件保存 | Workbench save button / Cmd+S |
| `WorkbenchStore.LeftViewId` | "settings" view | ActivityBar + renderLeftSidebarContent |

### 维度 2: Interaction Loop Completeness（交互闭环完整性）

**定义**: 用户可发起的操作是否形成了完整的闭环——触发→状态变更→UI 反馈→可继续操作。

**扫描方法**:
1. 列出所有用户可触发的操作（按钮、快捷键、拖拽、选择）
2. 对每个操作，追踪: 触发 → store 变更 → UI 重渲染 → 后续可用操作
3. 检查是否有"死胡同"操作（触发后无法回到正常状态）

**检查清单**:

| 操作 | 触发点 | Store 变更 | UI 反馈 | 闭环? |
|------|--------|-----------|---------|-------|
| 新建会话 (+) | assistant-panel | clearLoadedSession | timeline 清空 | ❌ 未 clearRun |
| 发送消息 | textarea Enter | startFlow | timeline 流式更新 | ✅ |
| 选择 Flow | FlowSelector | setActiveFlow | canvas 更新 | ✅ |
| 选择历史会话 | session picker | loadSession | timeline 加载 | ✅ |
| 回到实时 | "Back to live" | clearLoadedSession | timeline 恢复 | ✅ |
| 保存 Flow | Cmd+S / 按钮 | saveFlow + markSaved | dirty 标记清除 | ❌ 无 saveFlow |
| 打开设置 | ActivityBar 齿轮 | setActiveLeftView("settings") | settings 面板 | ❌ 无 settings view |
| 修改节点配置 | Inspector | updateNodeConfig | canvas + YAML | ✅ |
| 切换面板 | ActivityBar | toggleLeftSidebar | 面板展开/收起 | ✅ |

### 维度 3: Cross-module Consistency（跨模块一致性）

**定义**: 同一概念在不同模块间的表示和行为是否一致。

**扫描方法**:
1. 列出核心概念（flow, session, node, agent, prompt）
2. 对每个概念，检查在 store、schema、UI、platform 四层的表示是否一致
3. 检查跨层传递时是否有信息丢失或语义偏移

**检查清单**:

| 概念 | Schema 层 | Store 层 | UI 层 | Platform 层 | 一致? |
|------|-----------|---------|-------|-------------|-------|
| Flow 脏标记 | FlowDefinition (无) | DocumentState.isDirty | 无 save 按钮 | workspace.createFile | ❌ 缺保存闭环 |
| Session | LocalRunRecord | runsByFlowPath | assistant-panel timeline | 无持久化 API | ⚠️ 仅内存 |
| Node config | NodeDef.config | updateNodeConfig | Inspector fields | 无 | ✅ |
| Agent binding | NodeDef.agentId/agentRef | updateNodeAgentRef | Inspector dropdown | prompt-asset-resolver | ✅ |
| Model | AgentDefSchema.modelProfile.model | 无全局默认 | Inspector string input | 无 | ❌ 无选择器 |
| Tool policy | AgentDefSchema.toolPolicy | 无 | 无 UI | 无 | ❌ 未暴露 |

## 3. 缺陷分级标准

### P0 — 功能失效（用户核心路径阻断）

- **定义**: 用户核心路径上的功能完全不可用或产生错误结果
- **修复时限**: 当前迭代必须修复
- **验证要求**: 必须有 E2E 测试覆盖

### P1 — 功能缺失（用户可发现但可绕行）

- **定义**: 功能入口存在但行为不完整，或契约定义了但 UI 未暴露
- **修复时限**: 近 1-2 个版本
- **验证要求**: 必须有集成测试覆盖

### P2 — 体验缺陷（不影响功能正确性）

- **定义**: UI 反馈不及时、交互不顺畅、信息展示不充分
- **修复时限**: 中期 roadmap
- **验证要求**: 建议有单元测试覆盖

## 4. 扫描结果（2025-01 最新）

### Domain A: 会话管理

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| A1 | 新建会话不清除运行状态 | 交互闭环 | **P0** | `handleNewSession` 只调 `clearLoadedSession()`，未调 `clearRun()` |
| A2 | 会话仅内存存储，无持久化 API | 跨模块一致性 | P1 | `useSessionPersistence` 依赖 `platform.workspace.createFile` 但无 load API |
| A3 | 历史会话列表无分页 | 体验缺陷 | P2 | sessions 数组全量加载 |

### Domain B: Agent 配置

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| B1 | 模型选择为纯文本输入，无下拉选择 | Contract→UI Gap | **P0** | `paramType: "string"` 而非 `"select"` |
| B2 | 无 turnMode 参数 | Contract→UI Gap | P1 | NodeSpec 未定义 turnMode param |
| B3 | 无 toolPolicy 配置 UI | Contract→UI Gap | **P0** | Schema 定义了但 NodeSpec 未暴露 |
| B4 | 无 memoryPolicy 配置 UI | Contract→UI Gap | P1 | Schema 定义了但 NodeSpec 未暴露 |
| B5 | 无 budgets/timeouts 配置 UI | Contract→UI Gap | P1 | Schema 定义了但 NodeSpec 未暴露 |
| B6 | 无 outputKind 选择 | Contract→UI Gap | P1 | Schema 定义了但 NodeSpec 未暴露 |

### Domain C: Flow 操作

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| C1 | 无 Flow 保存功能 | 交互闭环 | **P0** | workspace-store 无 `saveFlow` action |
| C2 | 无 Cmd+S 快捷键 | 交互闭环 | P1 | Workbench 无 keydown handler |
| C3 | dirty 标记无 UI 指示 | 跨模块一致性 | P1 | Tab 无 dirty indicator |

### Domain D: Inspector 展示

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| D1 | 选中 edge 时 I/O 数据展示不完整 | 交互闭环 | P1 | Inspector 仅显示 edge ID，未显示 port data |
| D2 | 无 adapterKind 选择 | Contract→UI Gap | P1 | 运行时绑定路径关键字段未暴露 |

### Domain E: Prompt 资产

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| E1 | `.agents-flow` 在 Explorer 默认折叠 | 体验缺陷 | P2 | isHidden=true 但无展开引导 |
| E2 | 资产引用关系无可视化 | 体验缺陷 | P2 | 中期 roadmap 项 |

### Domain F: 全局设置

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| F1 | 无全局设置面板 | Contract→UI Gap | **P0** | LeftViewId 无 "settings"，无 settings store |
| F2 | 无全局模型/transport 默认配置 | 跨模块一致性 | **P0** | 每次创建 flow 都需重新配置 |

### Domain G: 平台一致性

| ID | 缺陷 | 维度 | 等级 | 根因 |
|----|------|------|------|------|
| G1 | Web mode 无真实后端 | 跨模块一致性 | P1 | dev:web 使用 mock API |
| G2 | Desktop IPC 链路未完整验证 | 跨模块一致性 | P1 | 缺 Desktop smoke E2E |

## 5. 扫描执行流程

```
┌─────────────────────────────────────────────────┐
│ 1. Contract 扫描                                │
│    遍历 Schema 所有字段 → 检查 UI 是否暴露      │
├─────────────────────────────────────────────────┤
│ 2. Interaction 扫描                             │
│    列出所有用户操作 → 追踪闭环 → 标记断裂点     │
├─────────────────────────────────────────────────┤
│ 3. Consistency 扫描                             │
│    核心概念 × 四层表示 → 标记不一致             │
├─────────────────────────────────────────────────┤
│ 4. 分级 & 归档                                  │
│    P0/P1/P2 分级 → 更新 PRD §8 → 补 E2E 测试   │
├─────────────────────────────────────────────────┤
│ 5. 验证                                         │
│    pnpm typecheck + build + test → 确认无回归   │
└─────────────────────────────────────────────────┘
```

## 6. 防退化机制

### 6.1 E2E 测试守门

每个 P0 缺陷修复后，必须在 `requirements-e2e.test.ts` 中添加对应测试:
- 测试直接操作 Zustand store，不依赖 DOM
- 使用 `FakeAgentAdapter` + `registerRuntimeAdapterExtension`
- `afterEach` 中必须 `unregisterRuntimeAdapterExtension` 并重置 store

### 6.2 契约-UI 一致性检查

在 CI 中增加步骤:
1. 提取 `AgentDefSchema` 的所有可选字段名
2. 提取 `AgentMainSpec.params` + `AgentSubSpec.params` 的 paramId
3. 断言关键字段（model, toolPolicy, memoryPolicy, budgets, timeouts, outputKind）在 params 中有对应条目
4. 断言失败 → CI 阻断

### 6.3 交互闭环检查

对每个用户操作，E2E 测试必须验证:
1. 操作触发后 store 状态变更正确
2. 操作后 UI 可继续正常交互（无死胡同）
3. 操作幂等性（重复触发不产生副作用）

## 7. 与 PRD 的联动规则

- 扫描结果中的 P0 缺陷 → 必须出现在 PRD §8 "当前关键缺口"
- 扫描结果中的 P1 缺陷 → 必须出现在 PRD §9 "中期 Roadmap" Phase 1
- 新增 KR → 必须有对应验收信号和验证方式
- 缺陷修复 → 必须同步更新扫描结果中的状态
- 每次迭代结束 → 重新执行三维扫描，更新本文档
