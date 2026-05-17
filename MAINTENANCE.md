# AgentsFlow 维护文档

> 本文档面向项目维护者，记录架构决策、构建流程、开发工作流和常见问题。

---

## 目录

1. [项目结构](#1-项目结构)
2. [技术栈](#2-技术栈)
3. [构建系统](#3-构建系统)
4. [开发工作流](#4-开发工作流)
5. [双平台架构](#5-双平台架构)
6. [包依赖关系](#6-包依赖关系)
7. [Electron 桌面端](#7-electron-桌面端)
8. [Web 浏览器端](#8-web-浏览器端)
9. [TypeScript 配置](#9-typescript-配置)
10. [测试策略](#10-测试策略)
11. [打包发布](#11-打包发布)
12. [常见问题](#12-常见问题)
13. [命名规范](#13-命名规范)

---

## 1. 项目结构

```
AgentsFlow/
├── apps/
│   ├── desktop/          # Electron 桌面应用壳
│   │   ├── src/main/     # 主进程 (main.ts, app.ts, preload.ts)
│   │   ├── src/renderer/ # 渲染进程 HTML 入口
│   │   ├── scripts/      # dev.js 开发启动脚本
│   │   └── vite.config.ts
│   ├── web/              # 纯 Web 应用 (Vite only, port 3000)
│   │   ├── src/          # index.tsx + index.html
│   │   └── vite.config.ts
│   └── studio/           # 共享渲染器 (被 desktop 和 web 复用)
│       ├── src/          # index.tsx + index.html
│       └── vite.config.ts
├── packages/
│   ├── shared-contracts/ # IPC 通道类型、DTO、错误码
│   ├── agent-contracts/  # Agent 抽象接口
│   ├── flow-schema/      # Flow YAML Schema + Zod 校验
│   ├── flow-engine/      # Flow 调度器、节点执行器
│   ├── agent-registry/   # 适配器发现与注册
│   ├── local-store/      # SQLite 事件持久化
│   ├── platform-adapter/ # IPC/HTTP 平台抽象 + React Context
│   ├── ui-flow/          # React Flow 画布 + 面板
│   └── testing-kit/      # Fake 适配器、测试工具
├── tsconfig.base.json    # 共享 TS 编译配置
├── pnpm-workspace.yaml   # monorepo 工作区定义
├── start.sh              # 便捷启动脚本
└── package.json          # 根 package.json
```

---

## 2. 技术栈

| 领域 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | ≥ 20 (推荐 22) |
| 包管理 | pnpm | 9.15.4 |
| 语言 | TypeScript | 5.x |
| 桌面框架 | Electron | 35.x |
| 前端框架 | React | 19.x |
| 状态管理 | Zustand | 5.x |
| 画布 | @xyflow/react | 12.x |
| 代码编辑器 | Monaco Editor | via @monaco-editor/react |
| 构建工具 | Vite 6 + esbuild | — |
| Schema 校验 | Zod | 3.24+ |
| YAML 解析 | yaml | 2.7+ |
| 测试 | Vitest | 3.x |

### 中国镜像配置

项目默认使用中国镜像加速依赖下载：

```bash
# npm 镜像
export COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"

# Electron 二进制镜像
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

`start.sh` 已内置这些配置。

---

## 3. 构建系统

### 构建命令

```bash
# 构建所有包
pnpm build

# 仅构建核心契约包
pnpm build:contracts

# 清理所有构建产物
pnpm clean

# 类型检查
pnpm typecheck
```

### 构建顺序

包之间存在依赖关系，必须按顺序构建。`pnpm -r run build` 会根据 workspace 拓扑自动排序：

```
shared-contracts ──┐
agent-contracts ───┤
flow-schema ───────┼──▶ flow-engine
                   ├──▶ agent-registry
                   ├──▶ local-store
                   ├──▶ testing-kit
                   └──▶ platform-adapter
                                     └──▶ ui-flow ──▶ apps/*
```

### 构建产物

- 库包：`dist/` 目录，输出 `.js` + `.d.ts` + `.d.ts.map`
- Electron 主进程：`apps/desktop/dist/main/`，由 esbuild 打包
- 渲染进程：`apps/desktop/dist/renderer/`，由 Vite 构建
- Web 应用：`apps/web/dist/`，由 Vite 构建

---

## 4. 开发工作流

### 日常开发（Web 模式）

```bash
pnpm dev:web
# → Vite dev server 启动在 http://localhost:3000
# → 无需 Electron，浏览器直接预览
# → 使用 HTTP 适配器连接后端 API
```

**适用场景**：UI 开发、Flow 编辑器调试、日常迭代。

### 桌面端开发

```bash
pnpm dev:desktop
# 或 ./start.sh
```

启动流程（`apps/desktop/scripts/dev.js`）：

1. **构建 workspace 包** — `pnpm --filter '!@agentsflow/desktop' -r run build`
2. **esbuild 打包主进程** — 将 `src/main/main.ts` 和 `preload.ts` 打包到 `dist/main/`
3. **启动 Vite dev server** — 渲染进程热更新，端口 5173
4. **启动 Electron** — 加载 Vite dev server 的 URL

> ⚠️ pnpm filter 语法：`--filter` 必须在 `-r` 之前，且模式需要引号包裹避免 zsh glob 展开。

### 环境激活

所有 Node.js 命令前需激活 nvm：

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

`start.sh` 和 `.command` 启动脚本已内置此步骤。

---

## 5. 双平台架构

### PlatformApi 接口

`@agentsflow/platform-adapter` 定义了统一的 `PlatformApi` 接口：

```typescript
interface PlatformApi {
  readonly platform: "electron" | "web";
  readonly flow: FlowApi;      // list, load, save, validate
  readonly run: RunApi;        // start, pause, resume, abort, getStatus
  readonly agent: AgentApi;    // listAdapters, getAdapter
  readonly store: StoreApi;    // query, getRunEvents
  on(channel: string, callback: (...args: any[]) => void): () => void;
}
```

### 平台检测

```typescript
// detect.ts
function detectPlatform(): "electron" | "web" {
  if (typeof window !== "undefined" && typeof (window as any).agentsflow !== "undefined") {
    return "electron";
  }
  return "web";
}
```

### Electron 适配器

通过 `window.agentsflow` IPC bridge（由 `preload.ts` 注入）调用主进程：

```
Renderer → window.agentsflow.flow.list() → ipcRenderer.invoke("flow:list") → Main Process
```

### HTTP 适配器

通过 `fetch()` 调用 REST API：

```
Renderer → fetch("http://localhost:3000/api/flows") → Backend Server
```

后端 API 基地址通过 `VITE_API_BASE_URL` 环境变量配置，默认 `http://localhost:3000/api`。

### React 集成

```tsx
// 自动检测平台
<PlatformProvider>
  <FlowEditor />
</PlatformProvider>

// 显式指定适配器（用于测试）
<PlatformProvider api={createHttpAdapter("http://localhost:8080/api")}>
  <FlowEditor />
</PlatformProvider>
```

---

## 6. 包依赖关系

```
                    shared-contracts
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    agent-contracts  flow-schema   platform-adapter
          │              │              │
    ┌─────┤        ┌─────┤        ┌─────┤
    │     │        │     │        │     │
  agent-registry  flow-engine    ui-flow
    │     │        │     │              │
    │   local-store │   testing-kit     │
    │              │                    │
    └──────────────┴────────────────────┘
                   │
              apps/desktop
              apps/web
              apps/studio
```

### 依赖规则

- `shared-contracts` — **零依赖**，纯类型定义
- `agent-contracts` — 仅依赖 `shared-contracts`
- `flow-schema` — 仅依赖 `zod` + `yaml`
- `platform-adapter` — 仅依赖 `shared-contracts`，`react` 为 peerDependency
- `ui-flow` — 依赖 `flow-schema`、`shared-contracts`、`platform-adapter`、React 生态
- `apps/*` — 可依赖所有 packages

---

## 7. Electron 桌面端

### 文件结构

```
apps/desktop/
├── src/
│   ├── main/
│   │   ├── main.ts       # Electron 入口，调用 createApp()
│   │   ├── app.ts        # 应用引导：注册 IPC、创建窗口
│   │   └── preload.ts    # contextBridge 暴露 window.agentsflow
│   ├── renderer/
│   │   ├── index.html    # CSP 安全策略 + 渲染入口
│   │   └── index.tsx     # React 挂载点
│   └── index.ts          # 包入口
├── scripts/
│   └── dev.js            # 开发启动脚本
├── vite.config.ts        # 渲染进程 Vite 配置
├── tsconfig.json         # 引用 main + renderer 子配置
├── tsconfig.main.json    # 主进程 TS 配置 (Node16)
└── tsconfig.renderer.json # 渲染进程 TS 配置 (bundler)
```

### IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `flow:list` | R→M | 列出所有 Flow 文件 |
| `flow:load` | R→M | 读取 Flow YAML |
| `flow:save` | R→M | 保存 Flow YAML |
| `flow:validate` | R→M | 校验 Flow 定义 |
| `run:start` | R→M | 启动 Flow 运行 |
| `run:pause` | R→M | 暂停运行 |
| `run:resume` | R→M | 恢复运行 |
| `run:abort` | R→M | 终止运行 |
| `run:getStatus` | R→M | 查询运行状态 |
| `agent:listAdapters` | R→M | 列出可用适配器 |
| `agent:getAdapter` | R→M | 获取适配器详情 |
| `store:query` | R→M | 查询事件存储 |
| `store:getRunEvents` | R→M | 获取运行事件列表 |

### CSP 安全策略

渲染进程 HTML 中的 Content-Security-Policy：

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;     ← Monaco Editor CDN
worker-src 'self' blob:;                         ← Monaco Web Worker
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
font-src 'self' https://cdn.jsdelivr.net data:;
img-src 'self' data:;
connect-src 'self' http://localhost:* ws://localhost:*;  ← Web 模式 API
```

---

## 8. Web 浏览器端

### 架构

`apps/web` 是一个纯 Vite 应用，不依赖 Electron：

- 端口：3000（避免与桌面端 5173 冲突）
- 传输层：HTTP REST（`fetch()`）
- 后端：需要独立运行 REST API 服务器（如 Express/Hono）
- 环境变量：`VITE_API_BASE_URL` 配置 API 地址

### 开发

```bash
pnpm dev:web
# → http://localhost:3000
```

### 限制

- 无文件系统直接访问（需后端 API 代理）
- 无实时事件推送（`on()` 返回空订阅，未来可接 WebSocket/SSE）
- 无法调用 Node.js 原生模块

---

## 9. TypeScript 配置

### 基础配置 (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 关键差异

| 包类型 | module | moduleResolution | jsx | lib |
|--------|--------|------------------|-----|-----|
| 库包 (`packages/*`) | Node16 | Node16 | — | ES2022 |
| 渲染进程 (`apps/*/src`) | ESNext | bundler | react-jsx | ES2022 + DOM |
| Electron 主进程 | Node16 | Node16 | — | ES2022 + Node |

### 重要规则

1. **ESM 导入必须带 `.js` 后缀**：`import { foo } from "./bar.js"`
2. **`composite: true`** 要求所有输入文件必须被 `include` 覆盖
3. **`exactOptionalPropertyTypes: true`** — 可选属性不能赋值 `undefined`
4. Vite 项目使用 `bundler` moduleResolution 以支持 `import.meta.env`

---

## 10. 测试策略

```bash
# 运行所有测试
pnpm test

# 仅运行契约包测试
pnpm test:contracts

# 单包测试
pnpm --filter @agentsflow/flow-engine run test
```

- 测试框架：**Vitest**
- 测试工具：`@agentsflow/testing-kit` 提供 `FakeAgentAdapter` 和 golden flow fixtures
- 每个包的测试位于 `src/**/*.test.ts`

---

## 11. 打包发布

### 桌面端打包

```bash
cd apps/desktop

# 打包当前平台
pnpm dist

# 仅构建不打包
pnpm build
```

打包工具：**electron-builder**（配置在 `apps/desktop/package.json` 的 `build` 字段）

### Web 端构建

```bash
cd apps/web
pnpm build       # 输出到 dist/
pnpm preview     # 预览构建结果
```

### 发布检查清单

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm build` 成功
- [ ] `pnpm dev:web` 正常启动
- [ ] `pnpm dev:desktop` 正常启动
- [ ] Electron 打包产物可运行

---

## 12. 常见问题

### Q: pnpm build 报错 "Cannot find module"

确保依赖已安装且包按正确顺序构建：

```bash
pnpm install
pnpm build
```

### Q: Electron 下载慢

设置中国镜像：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
pnpm install
```

### Q: Monaco Editor 加载失败

检查 CSP 策略是否包含 `https://cdn.jsdelivr.net`（script-src 和 font-src）以及 `blob:`（worker-src）。

### Q: ESM 导入报错 "ERR_MODULE_NOT_FOUND"

ESM 导入必须带 `.js` 后缀：

```typescript
// ❌ 错误
import { foo } from "./bar"

// ✅ 正确
import { foo } from "./bar.js"
```

### Q: pnpm filter 语法报错

- `--filter` 必须在 `-r` **之前**
- 模式需要**引号**包裹避免 shell glob 展开
- 正确：`pnpm --filter '!@agentsflow/desktop' -r run build`
- 错误：`pnpm -r --filter=./packages/* run build`（zsh 会展开 glob）

### Q: Vite dev server 启动后 Electron 窗口空白

等待 Vite 完全就绪后再启动 Electron。`dev.js` 有 10 秒超时机制。

### Q: `exactOptionalPropertyTypes` 导致赋值错误

可选属性不能显式赋值 `undefined`：

```typescript
interface Foo { bar?: string }
const x: Foo = { bar: undefined }  // ❌ 错误
const y: Foo = {}                   // ✅ 正确
```

---

## 13. 命名规范

### 包命名

- npm scope: `@agentsflow/`
- kebab-case：`flow-engine`、`agent-registry`
- 应用包：`@agentsflow/desktop`、`@agentsflow/web`、`@agentsflow/studio`

### 文件命名

- 源码：kebab-case（`flow-canvas.tsx`、`flow-store.ts`）
- 测试：`*.test.ts`
- 类型：`*.d.ts` 或内联在源文件中
- 入口：`index.ts`

### IPC 通道命名

- 格式：`domain:action`
- 示例：`flow:list`、`run:start`、`agent:getAdapter`

### 变量命名

- 接口：PascalCase（`FlowApi`、`RunStatus`）
- 函数：camelCase（`createApp`、`detectPlatform`）
- 常量：UPPER_SNAKE_CASE 或 camelCase（`API_BASE`）
- DTO：PascalCase + readonly（`FlowSummary`、`EventSummary`）
