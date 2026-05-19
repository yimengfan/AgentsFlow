import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Agent/Main — 主 Agent
 *
 * 主控 Agent：接收提示词、生成计划、评估结果，驱动子 Agent 执行。
 * 默认流程中用于"提示词输入"和"评分判断"环节。
 * Category path: "Agent/Main"
 */
export class AgentMainSpec extends NodeSpecBase {
  override readonly kind = "agent.main";
  override readonly label = "主 Agent";
  override readonly category = "Agent/MainAgent";
  override readonly description = "主控 Agent：接收提示词、生成计划、评估结果，驱动子 Agent 执行";
  override readonly icon = "bot";
  override readonly maxInstances = 1;
  override readonly tags = ["agent", "main", "planner"] as const;
  readonly legacyNodeType = "agent";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
    { portId: "prompt", dataType: "prompt" as PortDataType, required: false, label: "提示词" },
    { portId: "data", dataType: "any" as PortDataType, required: false, label: "数据" },
  ] as const;

  override readonly outputPorts = [
    { portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" },
    { portId: "result", dataType: "string" as PortDataType, required: false, label: "结果" },
    { portId: "plan", dataType: "plan" as PortDataType, required: false, label: "计划" },
  ] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "systemPrompt",
      label: "系统提示词",
      paramType: "code",
      required: false,
      description: "主 Agent 的系统级指令",
      group: "提示词",
    },
    {
      paramId: "userPrompt",
      label: "用户提示词",
      paramType: "code",
      required: false,
      description: "初始用户提示词模板",
      group: "提示词",
    },
    {
      paramId: "model",
      label: "模型",
      paramType: "string",
      required: false,
      description: "使用的模型标识",
      group: "模型",
    },
    {
      paramId: "temperature",
      label: "温度",
      paramType: "number",
      required: false,
      defaultValue: 0.7,
      description: "生成温度 (0-2)",
      group: "模型",
    },
  ];
}
