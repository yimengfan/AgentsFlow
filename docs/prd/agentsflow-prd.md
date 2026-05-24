# AgentsFlow Product PRD

## 1. 文档定位

- 文档状态：Draft
- 适用阶段：当前阶段到近 1-2 个版本，同时附中期 roadmap
- 目标受众：内部产品、研发、设计、交付协同成员
- 文档目标：把 AgentsFlow 当前阶段的产品问题、交付边界与模块化需求沉淀为可执行的 Objective / KR

本 PRD 不是架构说明书，也不是实现细节清单。它回答三件事：

- AgentsFlow 现在真正要解决什么问题。
- 当前阶段产品要优先交付哪些能力。
- 每项能力应该落到哪些模块、用什么口径判断是否完成。

## 2. 问题定义

当前多 Agent 工作流通常存在四个共性问题：

- 编排方式偏文本和脚本化，节点关系、上下游依赖、循环与分支不够直观。
- 调试方式偏黑盒，只能看到最终输出，难以定位 Prompt 来源、执行路径、节点输入输出与失败原因。
- Prompt、instructions、skills、agent 配置缺少统一资产模型，复用困难，维护成本高。
- 桌面与 Web 的能力边界不清晰，导致工作台体验、平台调用方式和验证方式容易分裂。

AgentsFlow 的核心产品命题，是把 Agent 编排从“难以观察的脚本流程”升级为“可视化 Flow 编排、可执行、可观测、可复用”的工作台。

## 3. 产品主张

AgentsFlow 在当前阶段的产品主张如下：

- Flow First：产品中心是 Flow，而不是单一聊天窗口。
- Visual Orchestration：通过图形化 Canvas、节点模块和 Inspector 提高编排效率。
- Observable Runtime：让运行时过程、Prompt 来源、会话、事件、输入输出可见。
- Modular Agent Assets：让 `.agents-flow` 成为 Prompt 与 Agent 资产的组织基础。
- Shared Workbench：在 Web 与 Desktop 上复用一致的工作台心智模型。

## 4. 目标用户

### 4.1 Flow Designer

关注点：快速搭建 Flow、连接节点、调整结构、校验流程。

成功标准：可以在不深入阅读 YAML 的情况下完成大部分图形化编排工作，并理解当前 Flow 的结构与状态。

### 4.2 Agent / Prompt Maintainer

关注点：维护 agent、instructions、skills、global prompt，确保资产可引用、可复用、可定位。

成功标准：可以清楚知道一个节点绑定了哪个 agent，最终 Prompt 由哪些来源装配而成。

### 4.3 Runtime Debugger

关注点：运行 Flow、查看执行步骤、回放历史、定位失败节点、理解输入输出与事件流。

成功标准：可以定位问题发生在哪个节点、为什么发生、是否与 Prompt、数据或绑定有关。

## 5. 当前阶段范围

### 5.1 范围内

- 图形化 Flow 编排工作台
- 基于节点的参数编辑与 Inspector
- Flow 运行、历史查看与运行细节展示
- Prompt / Agent 资产的引用与装配
- Web / Desktop 共用工作台与平台抽象
- 与现有架构一致的文档、验证与交付闭环

### 5.2 范围外

- 多人实时协作与权限体系
- 运行时改写 YAML 作为执行结果的一部分
- 脱离 `PlatformProvider` 的平台能力调用
- 将 `layout.nodeBindings` 作为当前阶段的可执行绑定来源
- 依赖完整真实 pi-mono 服务的产品承诺
- 当前阶段承诺断点式、单步式调试能力

## 6. 成功标准

- 新用户可以从 Workbench 完成 Flow 创建、编辑、运行与结果查看的主流程。
- 运行失败时，用户可以通过 Run Detail、Prompt Sources、Timeline 与 Node Debug State 定位主要原因。
- Agent 资产的引用关系对研发是可解释的，避免“节点为什么调用这个 Prompt”成为隐性知识。
- PRD、ADR、spec、测试和实现之间有清晰的追溯路径，减少产品目标与代码现状漂移。

## 7. Objectives And KRs

## O1 图形化 Agent 编排工作台

目标：让 Flow 结构设计、节点配置和工作区切换变得更快、更直观。

### KR1.1 设计 Workbench 与多文档工作区

- 用户价值：用户需要在同一工作台中完成 Flow 浏览、打开、切换和预览，而不是在不同页面跳转。
- 当前基线：已有 Workbench、Activity Bar、Explorer、Center Workspace、Assistant Panel 的整体框架。
- 目标状态：工作台成为唯一的编排入口，支持明确的左侧导航、中心编辑区、右侧运行观察区和底部预览区协同。
- 范围内：Explorer、Tab、Center Workspace、Bottom Preview、左右侧栏协同关系。
- 范围外：新增第二套独立编辑壳层或打破现有 Workbench 布局不变量。
- 主要依赖：`packages/ui-flow/src/components/workbench.tsx`、`packages/ui-flow/src/components/center-workspace.tsx`、`docs/adr/001-workbench-layout.md`。
- 验收信号：工作台主结构、视图切换和多文档行为对用户可理解，且所有新需求继续收敛在 Workbench 内部完成。

### KR1.2 设计 Flow Canvas 与节点模块化编排

- 用户价值：用户需要通过拖拽、连线与节点操作快速组织 Flow，而不是手写结构。
- 当前基线：已有 React Flow Canvas、自定义节点渲染、节点上下文菜单和数据边预览。
- 目标状态：节点创建、拖拽、连接、删除、选择与结构阅读成为顺畅的主路径；节点类别与语义可被理解。
- 范围内：Canvas、Node Palette、连接规则、节点状态表现、数据边信息表达。
- 范围外：把当前阶段变成完整低代码平台或引入独立脚本 DSL 编辑器。
- 主要依赖：`packages/ui-flow/src/components/flow-canvas.tsx`、`packages/ui-flow/src/components/node-context-menu.tsx`、`docs/specs/001-flow-node-contract.md`。
- 验收信号：用户可以完成从新建节点到连线成 Flow 的完整链路，并能读懂节点输入输出关系。

### KR1.3 设计 Inspector 与配置编辑面

- 用户价值：节点配置必须在上下文内完成，避免在多处跳转修改配置。
- 当前基线：已有 `FlowEditorSurface` 与 `NodeInspector` 的组合面板，节点和边选中后可进入 Inspector。
- 目标状态：Inspector 成为节点参数、端口、绑定、Prompt 字段与结构反馈的集中编辑面。
- 范围内：节点配置表单、端口信息、绑定字段、后续 YAML 关联入口。
- 范围外：在当前阶段承诺一套完整的 schema-driven form builder 平台化产品。
- 主要依赖：`packages/ui-flow/src/components/flow-editor-surface.tsx`、`packages/ui-flow/src/components/node-inspector.tsx`、`docs/specs/001-flow-node-contract.md`。
- 验收信号：选中节点后，用户能在 Inspector 内理解并修改主要配置，而不是回到 YAML 手工定位。

### KR1.4 设计 YAML 与验证反馈闭环

- 用户价值：图形编辑和 YAML 不应彼此割裂，用户需要知道图上的改动如何映射到底层定义。
- 当前基线：YAML Reveal 回调已预留，但 YAML 面板当前未启用；校验错误已有状态但界面反馈不足。
- 目标状态：产品层明确保留 YAML 作为设计时真相，同时为后续启用 YAML 联动、错误反馈和定位建立需求基线。
- 范围内：YAML 入口、验证反馈、图形编辑到定义层的认知衔接。
- 范围外：运行时回写 YAML 或将 YAML 变成唯一交互界面。
- 主要依赖：`packages/ui-flow/src/components/flow-editor-surface.tsx`、`packages/ui-flow/src/store/workspace-store.ts`、`packages/flow-schema`。
- 验收信号：产品文档明确静态 YAML 的角色，并为后续联动能力提供可追踪的需求描述。

## O2 运行时观测与调试闭环

目标：让用户不只“运行 Flow”，还能看清发生了什么、为什么成功或失败。

### KR2.1 设计聊天预览与运行详情双视图

- 用户价值：用户既需要面向对话的结果视角，也需要面向节点执行的工程视角。
- 当前基线：右侧已有 Assistant Chat 与 Run Detail 两个视图，底部还有 Bottom Preview。
- 目标状态：聊天预览、运行详情和底部预览构成互补视图，分别承载结果理解、执行追踪与运行控制。
- 范围内：Assistant Chat、Run Detail、Bottom Preview、状态标签、流转提示。
- 范围外：把聊天面板产品化为独立 Copilot 聊天产品。
- 主要依赖：`packages/ui-flow/src/components/assistant-panel.tsx`、`packages/ui-flow/src/components/bottom-preview.tsx`、`packages/ui-flow/src/store/runtime-store.ts`。
- 验收信号：用户可以从至少两个视角回看同一条运行链路，并理解当前运行状态。

### KR2.2 设计 Prompt Sources、输入输出与数据追踪

- 用户价值：定位问题时，必须看见 Prompt 来自哪里、节点收到了什么、输出去了哪里。
- 当前基线：运行时已保存 `promptSources`、`inputTraces`、`outputTraces`、`usage`、`toolCalls`、`errorTrace` 等调试数据。
- 目标状态：产品层将这些字段定义为调试闭环的一等信息，而不是底层实现细节。
- 范围内：Prompt 来源展示、输入输出可视化、数据来源追踪、错误信息表达。
- 范围外：本阶段承诺完整的数据血缘分析平台或复杂 APM 系统。
- 主要依赖：`packages/ui-flow/src/store/runtime-store.ts`、`packages/flow-engine/src/scheduler/flow-scheduler.ts`、`packages/flow-engine/src/executor/node-executor.ts`。
- 验收信号：发生错误或结果异常时，用户能定位是 Prompt、绑定、输入数据还是执行过程的问题。

### KR2.3 设计聊天数据装载与运行历史加载

- 用户价值：用户需要从历史运行中回看上下文，而不是只看一次性的临时输出。
- 当前基线：已有 run timeline、local run record、session picker 结构，但 Flow 列表装载和历史入口仍不完整。
- 目标状态：Flow 选择、运行历史、会话切换和时间线展示形成清晰的用户路径。
- 范围内：Flow Selector、Session Picker、Run Timeline、历史详情加载。
- 范围外：跨设备云同步或多人共享运行记录。
- 主要依赖：`packages/ui-flow/src/components/assistant-panel.tsx`、`packages/ui-flow/src/store/runtime-store.ts`、`packages/platform-adapter`。
- 验收信号：用户能基于 Flow 与历史会话快速回到某次执行上下文，并进行复盘。

### KR2.4 设计失败定位与调试闭环

- 用户价值：产品必须帮助用户解释失败，而不是只给出失败状态。
- 当前基线：节点状态、错误痕迹、事件流、运行状态标签已存在，但缺少产品级调试策略描述。
- 目标状态：明确产品对失败定位的支持层级，包括节点状态、错误字段、Prompt 来源、事件回放与运行终态。
- 范围内：失败状态表达、错误上下文、运行终态、调试入口。
- 范围外：断点、单步执行和条件断点作为当前阶段承诺。
- 主要依赖：`packages/ui-flow/src/store/runtime-store.ts`、`packages/flow-engine/src/events/event-bus.ts`、`packages/flow-engine/src/context/run-context.ts`。
- 验收信号：主要失败场景都有可视化诊断线索，用户不必先阅读源码才知道运行为何失败。

## O3 Agent 资产模块化与复用

目标：让 Prompt、Agent、Instruction、Skill 从零散配置变成可组织、可组合、可解释的资产体系。

### KR3.1 设计 `.agents-flow` 资产模型与引用方式

- 用户价值：团队需要把 Prompt 与 Agent 资产沉淀成稳定目录结构，而不是散落在节点配置里。
- 当前基线：已有 `.agents-flow` 目录约定、asset scanner、parser、resolver 和 prompt assembler。
- 目标状态：产品明确将 `.agents-flow` 作为资产层入口，支持全局 prompt、agent、instructions、skills 的标准组织方式。
- 范围内：目录约定、agentRef 绑定、资产分类、引用模型。
- 范围外：当前阶段承诺可视化资产 IDE 或市场化资产分发。
- 主要依赖：`docs/specs/003-agents-flow-repo-spec.md`、`packages/prompt-asset-resolver/src/scanner.ts`、`packages/prompt-asset-resolver/src/parser.ts`。
- 验收信号：用户理解节点配置与资产目录的关系，研发能在统一结构中沉淀 Prompt 资产。

### KR3.2 设计 Prompt 装配顺序与可解释性

- 用户价值：最终 Prompt 必须可解释，否则无法维护质量。
- 当前基线：当前装配顺序已明确为 global system prompt -> instructions -> skills -> agent body -> node config -> run input。
- 目标状态：产品层把装配顺序与来源分层写成正式需求，调试视图可解释每一段内容从何而来。
- 范围内：装配顺序、去重规则、来源展示、层级说明。
- 范围外：本阶段承诺任意厂商私有 Prompt 语义兼容。
- 主要依赖：`packages/prompt-asset-resolver/src/prompt-assembler.ts`、`docs/specs/003-agents-flow-repo-spec.md`。
- 验收信号：团队对 Prompt 组成规则形成共识，避免运行时结果依赖隐性约定。

### KR3.3 设计 Agent 绑定预览与配置指导

- 用户价值：用户需要确认节点绑定了哪个 agent、该 agent 走哪个 adapter、会产生什么输出语义。
- 当前基线：运行时绑定路径已明确，但 UI 侧仍缺少更强的绑定预览与解释能力。
- 目标状态：在产品层明确“绑定可解释”是必须项，而不是附加项。
- 范围内：agentId、agentRef、adapterKind、turnMode、outputKind 的展示与指导。
- 范围外：把 `layout.nodeBindings` 作为当前阶段的运行时覆写机制。
- 主要依赖：`docs/specs/002-runtime-binding.md`、`packages/flow-engine/src/scheduler/flow-scheduler.ts`、`packages/ui-flow/src/components/node-inspector.tsx`。
- 验收信号：用户能从配置面和调试面理解节点绑定路径，而不是只能阅读 spec 或源码。

### KR3.4 设计 Prompt 资产浏览与后续扩展路线

- 用户价值：随着资产增多，仅靠文件系统理解成本会上升，需要产品层提前留出浏览与管理能力的空间。
- 当前基线：`.agents-flow` 在 Explorer 中默认不可见，尚无专门资产浏览界面。
- 目标状态：把资产浏览、可视化引用关系和后续管理能力列入明确的中期路线，而不混写成当前已实现能力。
- 范围内：中期 roadmap、依赖条件、与当前文件系统策略的关系。
- 范围外：本次承诺完整可视化 Prompt IDE。
- 主要依赖：`packages/ui-flow/src/components/explorer-pane.tsx`、`packages/platform-adapter`、`docs/specs/003-agents-flow-repo-spec.md`。
- 验收信号：产品路线中明确记录该能力，不再依赖口头约定。

## O4 跨平台一致性与交付稳定性

目标：让产品能力在 Web 与 Desktop 上保持统一心智，同时用清晰门禁保障交付质量。

### KR4.1 设计统一的跨平台 Workbench 体验

- 用户价值：无论在 Web 还是 Desktop，用户都应面对同一套主工作流与心智模型。
- 当前基线：两个端共享 `@agentsflow/ui-flow` 与 `PlatformProvider`，入口不同但工作台一致。
- 目标状态：产品需求默认先写共享工作台，再在平台适配层声明差异点。
- 范围内：统一 Workbench、共享平台抽象、端能力差异说明。
- 范围外：为不同平台分别设计两套产品主流程。
- 主要依赖：`README.md`、`packages/platform-adapter/src/platform-context.tsx`、`apps/web/src/index.tsx`、`apps/desktop/src/renderer/index.tsx`。
- 验收信号：产品文档中，平台差异以边界说明存在，而不是形成两套独立产品定义。

### KR4.2 设计平台边界与能力接入规则

- 用户价值：平台能力如果接入路径不清楚，会直接侵蚀 UI 一致性和后续维护性。
- 当前基线：已有 `PlatformApi` 抽象，UI 必须通过 `usePlatform()` 使用平台能力。
- 目标状态：任何新增平台能力都先经过需求层的边界检查，再映射到 IPC / HTTP 链路。
- 范围内：平台 API、工作区文件操作、运行入口、跨平台差异说明。
- 范围外：在 UI 中直接调用 Electron IPC 或原始 HTTP。
- 主要依赖：`packages/platform-adapter/src/platform-api.ts`、`packages/platform-adapter/src/electron-adapter.ts`、`packages/platform-adapter/src/http-adapter.ts`。
- 验收信号：平台能力需求都能追溯到统一适配层，而不是散落在组件中。

### KR4.3 设计验证门禁与交付闭环

- 用户价值：需求沉淀后必须能进入稳定交付流程，而不是成为孤立文档。
- 当前基线：已有 `typecheck`、`build`、`test`、Web / Desktop smoke、E2E 要求与测试补充文档。
- 目标状态：PRD 层明确哪些需求必须配套测试、文档、平台验证和回归检查。
- 范围内：验证阶梯、测试分层、需求与验证映射。
- 范围外：在需求交付时跳过验证并以文档替代运行检查。
- 主要依赖：`docs/testing-supplementation.md`、`.github/copilot-instructions.md`、`packages/testing-kit`。
- 验收信号：交付完成时，需求、实现与验证三者之间存在明确闭环。

### KR4.4 设计产品文档与架构文档的分层协同

- 用户价值：产品目标、架构决策、契约规则和测试门禁需要清晰分层，否则文档很快失真。
- 当前基线：仓库已有 README、ADR、spec、维护与测试文档，但没有产品需求层。
- 目标状态：形成 PRD -> ADR / spec -> implementation / tests 的稳定追溯路径。
- 范围内：总 PRD、管理规范、文档地图、链接入口。
- 范围外：把 PRD 写成新的架构文档或实现手册。
- 主要依赖：`docs/README.md`、`README.md`、`docs/prd/prd-management.md`。
- 验收信号：新人可以从仓库入口找到产品需求文档，并继续跳转到相关架构和实现面。

## 8. 当前关键缺口

> 稳定分析规则见 `docs/prd/product-feature-analysis-methodology.md`。
> 活跃缺陷源数据见 `docs/prd/defect-registry.md`。
> 本节只汇总当前阶段必须被产品层看见的 P0/P1 关键缺口，不再直接承载完整缺陷台账。

### P0 — 功能失效（用户核心路径阻断）

- **AF-D001 Desktop 平台入口未闭环**: Desktop renderer 仍未完成 `PlatformProvider` 注入，桌面端 Workbench 主路径无法与平台适配层正确闭合。
  - KR: Desktop 与 Web / Studio 保持一致的平台注入链路
  - 验证: Desktop smoke `pnpm dev:desktop`

- **AF-D002 Web 保存与校验接口 contract 未落地**: HTTP 适配层要求的 save / validate contract 与当前 Web dev server 暴露的接口不一致，Web 模式下关键编辑闭环仍有断口。
  - KR: Web `flow.save` / `flow.validate` 路径与 HTTP adapter 完整对齐
  - 验证: Web smoke + 平台边界验证

### P1 — 功能缺失（用户可发现但可绕行）

- **AF-D003 Agent `turnMode` 语义漂移**: Agent 节点在 NodeSpec、schema、starter flow 与 runtime 间使用了不同 `turnMode` 语义，配置与执行不再同源。
- **AF-D004 全局设置未进入默认创建链路**: Settings 面板已存在，但默认模型、transport 与审批策略仍然停留在孤立状态，未真正参与 Flow / Agent 默认创建。
- **AF-D005 Inspector 高级参数编辑保真度不足**: `multiselect` 等高级参数当前仍缺结构化编辑能力，存在“能配但容易配错”的伪闭环。

### P2 — 体验缺陷

- **AF-D006 Workspace 视图仍为占位态**: 导航入口已暴露，但内容尚未形成可交付的工作区管理能力。
- YAML 联动、资产可视化与更强调试能力仍属于中期进化项，不作为当前阶段闭环已完成能力。

## 9. 中期 Roadmap

### Phase 1: 当前阶段与近 1 个版本

- 完成 Web / Desktop 平台主链路闭环
- 对齐保存、校验、运行时绑定等关键 contract
- 清理仍然会误导用户的伪闭环入口或占位面

### Phase 2: 近 2 个版本

- 把全局设置、默认配置、持久化与恢复链路接入真实主路径
- 提升 Inspector 配置器的结构化编辑保真度
- 强化历史、恢复与调试可解释性

### Phase 3: 中期方向

- 更成熟的 YAML 联动、资产浏览和引用可视化
- 更强的调试 ergonomics 与运维观测面
- 经确认后再引入新的产品面，而不是先做平行扩展

## 10. 相关实现锚点

- Workbench：`packages/ui-flow/src/components/workbench.tsx`
- Flow 编排面：`packages/ui-flow/src/components/flow-editor-surface.tsx`
- 聊天与运行详情：`packages/ui-flow/src/components/assistant-panel.tsx`
- 运行时状态：`packages/ui-flow/src/store/runtime-store.ts`
- 调度器：`packages/flow-engine/src/scheduler/flow-scheduler.ts`
- Prompt 装配：`packages/prompt-asset-resolver/src/prompt-assembler.ts`
- 运行时绑定契约：`docs/specs/002-runtime-binding.md`
- Prompt 资产契约：`docs/specs/003-agents-flow-repo-spec.md`

## 11. 文档维护要求

- 当 Objective / KR 状态变化时，必须同步更新状态与依赖说明。
- 当活跃缺陷状态变化时，先更新 `docs/prd/defect-registry.md`，再同步回填本 PRD 的关键缺口摘要。
- 当新增产品分析或维护文档时，必须同步更新 `docs/prd/README.md`、`docs/README.md`、`README.md` 与 `.github/copilot-instructions.md` 的路由入口。
- 当需求触达运行时绑定、Prompt 装配顺序、平台边界、Workbench 可见行为时，必须同步核查 ADR / spec / tests 是否需要更新。
- 当某项能力被明确降级、延后或取消时，必须更新“范围外”或 roadmap，不得仅靠口头同步。
