import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Input/Prompt — 提示词输入节点
 *
 * 提示词输入节点：接收用户输入的提示词文本或从文件加载，
 * 作为流程的初始输入传递给下游 Agent 节点。
 * 默认与 Agent 节点的 prompt 端口连接，传递参数给 Agent。
 * Category path: "Input/Prompt"
 */
export class InputPromptSpec extends NodeSpecBase {
  override readonly kind = "input.prompt";
  override readonly label = "提示词输入";
  override readonly category = "Input/Prompt";
  override readonly description = "提示词输入节点：接收用户输入文本或从文件加载，传递给下游 Agent";
  override readonly icon = "pencil-square";
  override readonly tags = ["input", "prompt", "text", "user"] as const;
  readonly legacyNodeType = "prompt-input";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
  ] as const;

  override readonly outputPorts = [
    { portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" },
    { portId: "prompt", dataType: "prompt" as PortDataType, required: false, label: "提示词" },
  ] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "promptText",
      label: "提示词文本",
      paramType: "code",
      required: false,
      description: "用户输入的提示词内容，将传递给下游 Agent",
      group: "提示词",
    },
    {
      paramId: "promptFile",
      label: "提示词文件",
      paramType: "path",
      required: false,
      description: "从文件加载提示词（.md / .txt），与 promptText 合并",
      group: "提示词",
    },
    {
      paramId: "mergeMode",
      label: "合并模式",
      paramType: "string",
      required: false,
      defaultValue: "append",
      description: "文件与文本的合并方式：append（追加）| prepend（前置）| replace（替换）",
      group: "提示词",
      options: [
        { label: "追加", value: "append" },
        { label: "前置", value: "prepend" },
        { label: "替换", value: "replace" },
      ],
    },
  ];
}