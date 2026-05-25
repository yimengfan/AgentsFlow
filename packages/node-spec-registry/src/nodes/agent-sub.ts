import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Agent/Sub — 子 Agent
 *
 * 子 Agent：接收主 Agent 委派的任务并执行。
 * 默认流程中用于"执行"环节。
 * Category path: "Agent/Sub"
 */
export class AgentSubSpec extends NodeSpecBase {
  override readonly kind = "agent.sub";
  override readonly label = "子 Agent";
  override readonly category = "Agent/SubAgent";
  override readonly description = "子 Agent：接收主 Agent 委派的任务并执行";
  override readonly icon = "bot";
  override readonly tags = ["agent", "sub", "executor"] as const;
  readonly legacyNodeType = "agent";
  override readonly presetAgentRef = "sub-agent";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
    { portId: "prompt", dataType: "prompt" as PortDataType, required: false },
    { portId: "data", dataType: "any" as PortDataType, required: false },
  ] as const;

  override readonly outputPorts = [
    { portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" },
    { portId: "result", dataType: "string" as PortDataType, required: false },
    { portId: "plan", dataType: "plan" as PortDataType, required: false },
  ] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "systemPrompt",
      label: "系统提示词",
      paramType: "code",
      required: false,
      description: "子 Agent 的系统级指令",
      group: "提示词",
    },
    {
      paramId: "model",
      label: "模型",
      paramType: "select",
      required: false,
      options: [],
      description: "使用的模型（从设置中的 LLM 提供商动态加载）",
      group: "模型",
    },
    {
      paramId: "temperature",
      label: "温度",
      paramType: "number",
      required: false,
      defaultValue: 0.3,
      description: "生成温度 (0-2)，建议较低以保持稳定",
      validation: { min: 0, max: 2 },
      group: "模型",
    },
    {
      paramId: "maxTokens",
      label: "最大 Token 数",
      paramType: "number",
      required: false,
      description: "单次生成的最大 token 数",
      validation: { min: 1 },
      group: "模型",
    },
    {
      paramId: "turnMode",
      label: "回合模式",
      paramType: "select",
      required: false,
      defaultValue: "single",
      options: [
        { value: "single", label: "单回合" },
        { value: "multi", label: "多回合" },
      ],
      description: "Agent 执行的回合模式",
      group: "模型",
    },
    {
      paramId: "approvalRequirement",
      label: "工具审批策略",
      paramType: "select",
      required: false,
      defaultValue: "destructive_only",
      options: [
        { value: "never", label: "无需审批" },
        { value: "always", label: "始终审批" },
        { value: "destructive_only", label: "仅破坏性操作" },
      ],
      description: "工具调用时的审批要求",
      group: "工具策略",
    },
    {
      paramId: "allowedCapabilities",
      label: "允许的能力",
      paramType: "multiselect",
      required: false,
      description: "工具允许的能力列表（逗号分隔）",
      group: "工具策略",
    },
    {
      paramId: "blockedTools",
      label: "屏蔽的工具",
      paramType: "multiselect",
      required: false,
      description: "被屏蔽的工具列表（逗号分隔）",
      group: "工具策略",
    },
    {
      paramId: "visibleScopes",
      label: "可见记忆范围",
      paramType: "multiselect",
      required: false,
      options: [
        { value: "session", label: "Session" },
        { value: "run", label: "Run" },
        { value: "node", label: "Node" },
        { value: "agent-local", label: "Agent Local" },
        { value: "artifacts", label: "Artifacts" },
      ],
      description: "Agent 可见的记忆范围",
      group: "记忆策略",
    },
    {
      paramId: "writableScopes",
      label: "可写记忆范围",
      paramType: "multiselect",
      required: false,
      options: [
        { value: "session", label: "Session" },
        { value: "run", label: "Run" },
        { value: "node", label: "Node" },
        { value: "agent-local", label: "Agent Local" },
        { value: "artifacts", label: "Artifacts" },
      ],
      description: "Agent 可写入的记忆范围",
      group: "记忆策略",
    },
    {
      paramId: "turnMs",
      label: "单回合超时 (ms)",
      paramType: "number",
      required: false,
      defaultValue: 60000,
      description: "单回合超时时间（毫秒）",
      validation: { min: 1000 },
      group: "超时与预算",
    },
    {
      paramId: "sessionMs",
      label: "会话超时 (ms)",
      paramType: "number",
      required: false,
      defaultValue: 300000,
      description: "会话超时时间（毫秒）",
      validation: { min: 1000 },
      group: "超时与预算",
    },
    {
      paramId: "maxSteps",
      label: "最大步数",
      paramType: "number",
      required: false,
      description: "最大执行步数",
      validation: { min: 1 },
      group: "超时与预算",
    },
    {
      paramId: "maxCostUsd",
      label: "最大费用 (USD)",
      paramType: "number",
      required: false,
      description: "最大费用（美元）",
      validation: { min: 0 },
      group: "超时与预算",
    },
  ];
}
