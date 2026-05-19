import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Control/PlanLoop — 计划-执行循环
 *
 * 主 Agent → 计划 → 子 Agent 执行 → 评分判断 → 循环/结束
 * 默认流程中的核心循环控制节点。
 * Category path: "Control/PlanLoop"
 */
export class ControlPlanLoopSpec extends NodeSpecBase {
  override readonly kind = "control.plan-loop";
  override readonly label = "计划-执行循环";
  override readonly category = "Control/PlanLoop";
  override readonly description = "主 Agent → 计划 → 子 Agent 执行 → 评分判断 → 循环/结束";
  override readonly icon = "repeat";
  override readonly tags = ["control", "plan", "loop", "evaluate"] as const;
  readonly legacyNodeType = "loop";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
    { portId: "prompt", dataType: "prompt" as PortDataType, required: false, label: "提示词" },
  ] as const;

  override readonly outputPorts = [
    { portId: "plan", dataType: "plan" as PortDataType, required: false, label: "计划输出" },
    { portId: "execute", dataType: "flow" as PortDataType, required: true, label: "执行" },
    { portId: "evaluate", dataType: "flow" as PortDataType, required: true, label: "评分" },
    { portId: "done", dataType: "flow" as PortDataType, required: true, label: "完成" },
    { portId: "score", dataType: "score" as PortDataType, required: false, label: "评分结果" },
  ] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "maxIterations",
      label: "最大循环次数",
      paramType: "number",
      required: false,
      defaultValue: 5,
      description: "最多执行几轮计划-执行-评分",
      group: "循环",
    },
    {
      paramId: "completionThreshold",
      label: "完成阈值",
      paramType: "number",
      required: false,
      defaultValue: 0.8,
      description: "评分达到此阈值则判定完成 (0-1)",
      group: "循环",
    },
    {
      paramId: "evaluatePrompt",
      label: "评分提示词",
      paramType: "code",
      required: false,
      description: "用于评分的提示词模板",
      group: "评分",
    },
  ];
}
