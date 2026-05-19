import { NodeSpecBase } from "../base.js";
import type { PortDataType, ParamDef } from "@agentsflow/flow-schema";

/**
 * Loader/HTTP — HTTP 数据加载（支持 Auth）
 *
 * 从三方 API 加载数据，支持 Bearer / Basic / API Key 认证。
 * Category path: "Loader/HTTP"
 */
export class LoaderHttpAuthSpec extends NodeSpecBase {
  override readonly kind = "loader.http-auth";
  override readonly label = "HTTP 数据加载";
  override readonly category = "Loader/HTTP";
  override readonly description = "从三方 API 加载数据，支持 Auth 认证和自定义请求参数";
  override readonly icon = "globe";
  override readonly tags = ["loader", "http", "api", "auth"] as const;
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
      paramId: "url",
      label: "请求地址",
      paramType: "url",
      required: true,
      description: "API 端点 URL",
      group: "请求",
    },
    {
      paramId: "method",
      label: "HTTP 方法",
      paramType: "select",
      required: false,
      defaultValue: "GET",
      options: [
        { value: "GET" },
        { value: "POST" },
        { value: "PUT" },
        { value: "DELETE" },
      ],
      description: "HTTP 请求方法",
      group: "请求",
    },
    {
      paramId: "headers",
      label: "请求头",
      paramType: "json",
      required: false,
      description: "自定义请求头 JSON",
      group: "请求",
    },
    {
      paramId: "body",
      label: "请求体",
      paramType: "json",
      required: false,
      description: "POST/PUT 请求体 JSON",
      group: "请求",
    },
    {
      paramId: "authType",
      label: "认证类型",
      paramType: "select",
      required: false,
      defaultValue: "none",
      options: [
        { value: "none", label: "无认证" },
        { value: "bearer", label: "Bearer Token" },
        { value: "basic", label: "Basic Auth" },
        { value: "apikey", label: "API Key" },
      ],
      description: "认证方式",
      group: "认证",
    },
    {
      paramId: "authToken",
      label: "认证凭据",
      paramType: "secret",
      required: false,
      description: "Token / 密码 / API Key（安全存储）",
      group: "认证",
    },
    {
      paramId: "authHeader",
      label: "Key Header 名",
      paramType: "string",
      required: false,
      defaultValue: "X-API-Key",
      description: "API Key 模式下自定义 Header 名",
      group: "认证",
    },
  ];
}
