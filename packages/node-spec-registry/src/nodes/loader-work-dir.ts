import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Loader/WorkDir — 加载当前工作目录数据
 *
 * 默认流程的起点节点，自动加载当前工作目录中的文件。
 * Category path: "Loader/WorkDir"
 */
export class LoaderWorkDirSpec extends NodeSpecBase {
  override readonly kind = "loader.work-dir";
  override readonly label = "工作目录加载";
  override readonly category = "Loader/WorkDir";
  override readonly description = "加载当前工作目录中的文件数据，作为流程输入起点";
  override readonly icon = "folder-open";
  override readonly tags = ["loader", "workdir", "local", "directory", "files"] as const;
  readonly legacyNodeType = "input";

  override readonly inputPorts = [
    { portId: "in", dataType: "flow" as PortDataType, required: true, label: "入" },
  ] as const;

  override readonly outputPorts = [
    { portId: "out", dataType: "flow" as PortDataType, required: true, label: "出" },
    { portId: "data", dataType: "documents" as PortDataType, required: false, label: "数据" },
  ] as const;

  override readonly params: ReadonlyArray<ParamDef> = [
    {
      paramId: "directory",
      label: "目录路径",
      paramType: "path",
      required: false,
      description: "工作目录路径（默认为当前项目根目录）",
      group: "路径",
    },
    {
      paramId: "filePattern",
      label: "文件匹配",
      paramType: "string",
      required: false,
      defaultValue: "**/*",
      description: "Glob 匹配模式（如 **/*.md）",
      group: "路径",
    },
    {
      paramId: "recursive",
      label: "递归扫描",
      paramType: "boolean",
      required: false,
      defaultValue: true,
      description: "是否递归扫描子目录",
      group: "路径",
    },
    {
      paramId: "maxFileSize",
      label: "最大文件大小",
      paramType: "number",
      required: false,
      defaultValue: 10485760,
      description: "跳过超过此大小的文件（字节），默认 10MB",
      group: "路径",
    },
  ];
}
