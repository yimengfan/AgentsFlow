# PRD Management Guide

## 1. 目标

本文件定义 AgentsFlow PRD 的管理方式，确保产品目标、架构约束、实现边界和验证门禁保持一致。

它解决的问题不是“怎么写一篇好文档”，而是“怎么让 PRD 能长期指导交付，而不是写完即失效”。

## 2. 文档分层边界

### PRD 负责什么

- 产品问题定义
- 目标用户与场景
- 当前阶段范围、范围外与 roadmap
- Objective / KR 结构
- 交付优先级、验收口径与追溯要求

### ADR 负责什么

- 稳定的架构决策
- 为什么采用某种系统边界与布局约束
- 该决策带来的后果与不变量

### Spec 负责什么

- 可执行契约
- 绑定路径、装配顺序、节点和端口规则
- 实现必须遵守的格式、字段和语义

### Test / Validation Docs 负责什么

- 测试分层与门禁
- 需求交付时必须完成的验证步骤
- 覆盖缺口与补测规则

## 3. 管理对象

当前 PRD 层至少包含以下文档：

- `docs/prd/agentsflow-prd.md` — 总 PRD
- `docs/prd/prd-management.md` — 本管理规范

如后续拆分模块附录，应保持“总 PRD 统一目标、附录展开模块”的结构，避免多个主 PRD 并列失控。

## 4. 状态流转

每份 PRD 或重大 KR 条目都应使用以下状态之一：

- `Draft`：起草中，尚未完成关键范围和边界对齐。
- `Aligning`：正在进行产品 / 研发对齐，目标方向明确但仍可能调整。
- `Approved`：范围、优先级、验收口径已确认，可以进入排期与实现。
- `In Delivery`：已经进入开发交付阶段。
- `Validated`：实现与验证已完成，需求达到预期验收口径。
- `Archived`：需求已结束或被历史化保留，不再作为当前交付依据。

状态变化必须伴随日期和变更说明，不接受仅修改正文而不改状态。

## 5. Owner 机制

每个 Objective / KR 必须至少记录以下 owner 信息：

- Product Owner：负责问题定义、优先级、范围与成功标准。
- Tech Owner：负责判断需求是否与现有架构约束冲突，以及需要同步哪些 ADR / spec / tests。
- Delivery Owner：负责推进实现、验证与状态回填。

如果暂时没有明确 owner，条目不能直接进入 `Approved`。

## 6. Objective / KR 条目模板

每个 KR 至少应包含以下字段：

```md
### KRx.x 名称

- Status:
- Owner:
- 用户价值:
- 当前基线:
- 目标状态:
- 范围内:
- 范围外:
- 主要依赖:
- 实现锚点:
- 验收信号:
- 关联文档:
- 关联验证:
- 风险与待确认事项:
```

允许在总 PRD 中保持轻量描述，但进入排期前至少要补齐 `Status`、`Owner`、`实现锚点`、`验收信号` 和 `关联验证`。

## 7. 追溯规则

每个 Objective / KR 都必须能向下追溯到至少一类证据：

- 实现锚点：已有代码模块、入口组件、store、runtime 包或平台适配层
- 契约锚点：ADR、spec、schema 或平台接口说明
- 验证锚点：测试文件、验证命令或 smoke / E2E 入口

没有追溯证据的条目，只能停留在 `Draft` 或 `Aligning`。

## 8. 变更门禁

以下变化发生时，不能只更新实现，必须同步核查 PRD：

| 变化类型 | 必须联动核查的文档 / 资产 |
| --- | --- |
| Workbench 可见行为变化 | `docs/prd/agentsflow-prd.md`、`docs/adr/001-workbench-layout.md`、`packages/ui-flow` 相关测试 |
| 节点、端口、Inspector 配置语义变化 | `docs/prd/agentsflow-prd.md`、`docs/specs/001-flow-node-contract.md`、相关 store / UI 测试 |
| 运行时绑定路径变化 | `docs/prd/agentsflow-prd.md`、`docs/adr/002-flow-runtime-extension.md`、`docs/specs/002-runtime-binding.md`、runtime tests |
| Prompt 装配顺序或资产模型变化 | `docs/prd/agentsflow-prd.md`、`docs/specs/003-agents-flow-repo-spec.md`、prompt resolver tests |
| 平台 API / IPC / HTTP 边界变化 | `docs/prd/agentsflow-prd.md`、平台适配层代码、平台相关测试 |
| 需求范围或路线图变化 | `docs/prd/agentsflow-prd.md`、必要时同步 `README.md` 或 `docs/README.md` |

## 9. 评审节奏

建议采用以下节奏：

- 需求起草评审：确认问题、目标用户、范围与范围外。
- 技术可行性评审：确认是否触达现有架构边界，是否需要 ADR / spec 同步。
- 开发前评审：确认 KR 的实现锚点、验证方式与 owner。
- 交付后回填：把状态更新为 `Validated` 或明确记录阻塞与剩余风险。

如果需求没有经历技术可行性评审，不应直接进入 `In Delivery`。

## 10. 验收与关闭规则

一个 KR 进入 `Validated` 前，至少满足以下条件：

- 需求范围和结果已经由 Product Owner 确认。
- 实现与现有架构边界没有冲突，或相关 ADR / spec 已同步更新。
- 至少完成一轮与改动切片匹配的验证。
- 涉及用户可见行为、运行时契约或平台边界时，已补充相应测试或明确记录未补原因。
- 文档中的状态、实现锚点、验证方式和剩余风险已回填。

## 11. 推荐协作方式

- 总 PRD 负责统一产品叙事，不要把实现细节越写越深。
- 复杂模块可以补附录，但附录必须从属于总 PRD，不单独漂移。
- 在需求评审会上，优先讨论范围边界、用户价值和验收口径，而不是先讨论组件命名。
- 在技术评审会上，优先讨论是否触达静态 YAML、运行时绑定、Prompt 装配和平台抽象等硬边界。

## 12. 当前阶段特别规则

- 任何需求都不得把运行时回写 YAML 当成当前阶段能力。
- 任何需求都不得把 `layout.nodeBindings` 描述成当前阶段可执行覆盖机制。
- 任何平台能力需求都必须通过 `PlatformProvider` / `usePlatform()` 路径落地。
- 任何涉及 Prompt 资产的需求，都必须尊重现有的 6 层装配顺序与 `agentRef` 绑定模型。

这些规则是为了避免 PRD 与现有实现、ADR、spec 发生根本冲突。
