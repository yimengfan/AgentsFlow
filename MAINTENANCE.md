# AgentsFlow 维护文档

> 本文档面向维护者，聚焦环境、构建、运行、发布与排障。
>
> 架构决策、运行时契约与 AI 贡献约束不再在这里重复维护，请优先从 [docs/README.md](./docs/README.md) 进入对应文档。

---

## 目录

1. [文档入口](#1-文档入口)
2. [环境与依赖](#2-环境与依赖)
3. [构建与验证](#3-构建与验证)
4. [开发与运行](#4-开发与运行)
5. [Electron 桌面端维护](#5-electron-桌面端维护)
6. [Web 浏览器端维护](#6-web-浏览器端维护)
7. [测试与发布](#7-测试与发布)
8. [常见问题](#8-常见问题)

---

## 1. 文档入口

| 需求 | 权威文档 | 用途 |
| ---- | -------- | ---- |
| 项目总览、快速开始 | `README.md` | 外部入口与基础认知 |
| 文档地图 | `docs/README.md` | 判断内容该去哪里找 |
| 工作台布局决策 | `docs/adr/001-workbench-layout.md` | shell 结构、面板约束、布局不变量 |
| Flow 运行时模型 | `docs/adr/002-flow-runtime-extension.md` | 运行时分层、扩展点、设计取舍 |
| 节点与运行时契约 | `docs/specs/001-flow-node-contract.md` | 节点、端口、参数、调试数据的维护规则 |
| 运行时绑定路径 | `docs/specs/002-runtime-binding.md` | `node.agentId` 到 transport 的执行路径 |
| AI 贡献约束 | `.github/copilot-instructions.md` | AI 编码规则、验证要求、常见陷阱 |
| 人类贡献流程 | `CONTRIBUTING.md` | 分支、验证、PR 流程 |

本文件只保留以下内容：

- 维护环境与依赖要求
- 日常构建和运行命令
- 桌面端与 Web 端的运维关注点
- 发布检查项与排障手册

---

## 2. 环境与依赖

### 必需版本

| 项目 | 要求 | 说明 |
| ---- | ---- | ---- |
| Node.js | >= 20，推荐 22 | 通过 nvm 激活 |
| pnpm | 9.15.4 | 使用 `corepack` 管理 |
| Electron | 35.x | 仅桌面端开发与打包涉及 |

### 环境激活

所有 Node.js 相关命令前先激活 nvm：

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### 中国镜像配置

```bash
export COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

`start.sh` 和相关 `.command` 脚本已内置这些设置。

---

## 3. 构建与验证

### 常用命令

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm clean
```

### 维护规则

- 所有构建和验证命令都从仓库根目录执行。
- monorepo 的构建顺序由 pnpm workspace 拓扑自动处理，不要手工跳过上游包。
- 共享包或公共契约变更后，至少执行一次完整的 `typecheck`、`build`、`test`。
- UI 变更除命令验证外，还应启动 `pnpm dev:web` 检查页面渲染和控制台错误。

### 产物位置

- 库包构建输出在各自的 `dist/`。
- Electron 主进程输出在 `apps/desktop/dist/main/`。
- Electron 渲染进程输出在 `apps/desktop/dist/renderer/`。
- Web 构建输出在 `apps/web/dist/`。

---

## 4. 开发与运行

### Web 模式

```bash
pnpm dev:web
```

- 默认端口 `3000`。
- 使用 HTTP 适配器，适合 UI 和工作台日常迭代。
- API 基地址通过 `VITE_API_BASE_URL` 配置。

### 桌面端模式

```bash
pnpm dev:desktop
# 或 ./start.sh
```

`apps/desktop/scripts/dev.js` 会执行：

1. 构建 workspace 共享包。
2. 使用 esbuild 打包 Electron 主进程与 preload。
3. 启动渲染进程 Vite dev server，默认端口 `5173`。
4. 启动 Electron 并加载开发地址。

> `pnpm --filter` 必须在 `-r` 之前，带否定条件时要加引号，避免 zsh 提前展开。

---

## 5. Electron 桌面端维护

### 文件结构

```text
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

### 平台能力扩展链路

新增或调整一个平台能力时，按这个顺序检查整条链：

1. `packages/shared-contracts/src/types/ipc-channels.ts`
2. `apps/desktop/src/main/app.ts`
3. `apps/desktop/src/main/preload.ts`
4. `packages/platform-adapter/src/platform-api.ts`
5. `packages/platform-adapter/src/electron-adapter.ts`
6. `packages/platform-adapter/src/http-adapter.ts`

### CSP 安全策略

渲染进程 HTML 中的 Content-Security-Policy：

```text
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;     ← Monaco Editor CDN
worker-src 'self' blob:;                         ← Monaco Web Worker
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
font-src 'self' https://cdn.jsdelivr.net data:;
img-src 'self' data:;
connect-src 'self' http://localhost:* ws://localhost:*;  ← Web 模式 API
```

---

## 6. Web 浏览器端维护

### 运行特征

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

### 维护限制

- 无文件系统直接访问（需后端 API 代理）
- 无实时事件推送（`on()` 返回空订阅，未来可接 WebSocket/SSE）
- 无法调用 Node.js 原生模块

---

## 7. 测试与发布

### 测试命令

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

## 8. 常见问题

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

命名、ESM、TypeScript 严格规则统一以 `.github/copilot-instructions.md` 为准，不在本文件重复维护。
