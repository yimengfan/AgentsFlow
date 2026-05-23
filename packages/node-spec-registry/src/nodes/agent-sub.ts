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
    { portId: "prompt", dataType: "prompt" as PortDataType, required: false, label: "提示词" },
    { portId: "data", dataType: "any" as PortDataType, required: false, label: "数据" },
  ] as const;

  override readonly outputPorts = [
    { portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" },
    { portId: "result", dataType: "string" as PortDataType, required: false, label: "结果" },
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
      defaultValue: 0.3,
      description: "生成温度 (0-2)，建议较低以保持稳定",
      group: "模型",
    },
  ];
}
