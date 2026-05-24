# PRD Docs

This directory holds the product requirement layer for AgentsFlow.

它承接产品目标、阶段范围、OKR 风格的 Objective / KR 拆解，以及需求管理规则；它不替代 ADR、spec 或测试文档。

## Reading Order

1. `agentsflow-prd.md` — 总 PRD，描述产品问题、目标用户、当前阶段范围、Objective / KR 与中期 roadmap。
2. `prd-management.md` — PRD 管理规范，描述状态流转、评审节奏、变更门禁、追溯规则与条目模板。

## How To Use

- 当你需要理解“这个产品当前要交付什么、为什么做、做到什么算完成”时，先看这里。
- 当你需要修改架构、运行时绑定、Prompt 装配、节点契约或平台边界时，再继续阅读对应 ADR / spec。
- 当需求发生变化时，先更新 PRD，再核查是否需要同步更新 ADR、spec、测试与实现。

## Related Documents

- `../README.md` — 仓库文档地图
- `../adr/001-workbench-layout.md` — Workbench 壳层与布局约束
- `../adr/002-flow-runtime-extension.md` — Flow 运行时模型与扩展边界
- `../specs/001-flow-node-contract.md` — 节点、端口、参数与 Inspector 契约
- `../specs/002-runtime-binding.md` — `node.agentId -> adapterKind` 绑定路径
- `../specs/003-agents-flow-repo-spec.md` — `.agents-flow` 资产模型与 Prompt 装配顺序
