import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Control/Finish — 结束节点
 *
 * 标记流程结束点，输出最终结果。
 * 默认流程中的终点节点。
 * Category path: "Control/Finish"
 */
export class ControlFinishSpec extends NodeSpecBase {
  override readonly kind = "control.finish";
  override readonly label = "结束节点";
  override readonly category = "Control/Finish";
  override readonly description = "标记流程结束点，输出最终结果";
  override readonly icon = "flag";
  override readonly tags = ["control", "finish", "output"] as const;
  readonly legacyNodeType = "output";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
    { portId: "result", dataType: "any" as PortDataType, required: false, label: "最终结果" },
  ] as const;

  override readonly outputPorts = [] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "outputFormat",
      label: "输出格式",
      paramType: "select",
      required: false,
      defaultValue: "text",
      options: [
        { value: "text", label: "文本" },
        { value: "json", label: "JSON" },
        { value: "markdown", label: "Markdown" },
      ],
      description: "最终结果的输出格式",
    },
  ];
}
