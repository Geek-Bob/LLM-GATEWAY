# LLM Gateway

此文件为 Claude Code 在此仓库中工作时提供指引。

## 项目概述
- 多 LLM 供应商统一代理 + 聊天 + 仪表盘的 Electron 42 桌面客户端
- 面向需要在多个 LLM 供应商之间切换的开发者和团队
- 每个 AI Agent 都想用全世界的模型，但每个模型都在说不同的语言。我们是 AI 世界的万能翻译官——让 Claude Code 用 GPT 的脑子、让 Cursor 跑开源的引擎，协议零损耗、能力零衰减。当 Agent 成为下一个操作系统，我们就是那个不可或缺的 TCP/IP 层。
- 此项目价值： 是 AI Agent 时代的协议棱镜->一次接入，折射到 OpenAI、Anthropic、开源模型的全世界，协议零损耗、能力零衰减。

## 技术栈

### 共用
| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| TypeScript | 6.0 | `enum`、`namespace`、装饰器 |
| ESLint | 10.x | `.eslintrc` 格式 |
| 测试 | vitest 4.x + jsdom 29.x | 前端 jsdom / 后端 node，配置分离 |

### 前端（renderer）
| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| React | 19.2 | `defaultProps`、`forwardRef`（应用代码）、class 组件 |
| Tailwind | 4.3 | `tailwind.config.ts`、`@layer components` |
| React Router | 7.x | `BrowserRouter`（Electron 用 HashRouter） |
| TanStack Query | 5.x | 字符串 queryKey（用数组 `['key', id]`） |
| Vite | 6.4 | 额外的 vite.config.ts（受 electron-vite 5.x 约束） |
| Shiki | 4.x | 高亮超过 5 种语言（ts/js/python/json/bash） |

### 后端（main）
| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| Electron | 42.x | — |
| Hono | 4.x | 在 `server.ts` 中写路由逻辑 |
| sql.js/WASM | 1.x | — |

### 构建与分发
| 技术 | 锁定版本 | 用途 |
|------|---------|------|
| electron-vite | 5.x | main/preload/renderer 三进程构建 |
| electron-builder | 26.x | Win(NSIS)/Mac(DMG)/Linux(AppImage+deb) |

### 目标平台
Windows / macOS / Linux 桌面

## 铁律（不可协商）
- `console.log` → 用 `core/logger.ts`
- `core/` 中禁止引入业务逻辑（core 只含通用工具）
- 单文件超过 500 行时必须按职责拆分
- **禁止 `confirm()` / `alert()` / `window.confirm()` / `window.alert()`** — Electron 无边框窗口下原生确认框会永久夺走焦点，用 Radix AlertDialog 替代
- 新功能 SDD（spec）→ TDD（Red → Green → Refactor），无例外
- 技术架构变更后必须更新 `docs/ARCHITECTURE.md`：目录结构、数据流、模块职责描述与实际代码保持一致
- 业务 CRUD 全部走 IPC（preload → ipcMain.handle）：providers / logs / stats / conversations / apiKeys

## Build & Test
- `npm run dev` — electron-vite dev | `npm run build` — 全量构建
- `npm test` — 前端 + 后端全量测试 | `npm run test:frontend` — 仅前端 | `npm run test:backend` — 仅后端
- `npm run lint` — eslint src/
- `npx tsc --noEmit` — 类型检查（不产出文件）
- `npx vitest run <path>` — 单文件/目录测试

## 架构
### 项目拓扑
```
src/
├── main/           # 主进程：业务逻辑、数据库、代理、IPC
├── preload/        # 桥接层：contextBridge 安全暴露 API
├── renderer/       # 渲染进程：React UI、TanStack Query
└── shared/         # 共享层：跨进程类型定义、工具函数
```

### 进程间边界
- `renderer/` 禁止导入 `main/` 任何文件（编译隔离，必须走 IPC）
- `main/` 禁止导入 `renderer/` 任何文件
- `shared/` 禁止导入 `main/`、`renderer/`、`preload/`（纯被动依赖）
- `preload/` 只导入 `shared/` 的类型定义
- 核心实体基础接口只在 `shared/types.ts` 定义，各层通过 type alias 派生，禁止重新定义同名 interface

### 调用链路（核心热路径）
```
业务 CRUD：Renderer → preload IPC → ipc/index.ts → domains/{name}.service.ts → db
Chat 代理：Renderer → HTTP (localhost:8080) → Hono proxy → upstream Provider
例外：shell/window/update 事件走 IPC
```

### 入口点
- 主进程：`src/main/index.ts`（窗口/Tray/启动）
- IPC 注册：`src/main/ipc/index.ts`（全部业务 CRUD handler）
- 渲染进程：`src/renderer/App.tsx`（路由 + 更新检测）
- 代理服务器：`src/main/proxy/server.ts`（Hono 应用）

### 数据流
```
SQLite（sql.js/WASM）→ providers / apiKeys / conversations / messages / stats
NDJSON 日志 → 每条请求一行 JSON，500 行/文件，最多 20 文件轮转（10000 条上限）
元数据 → logs-meta.json 记录 entryCounter / currentFileNumber / currentFileLines
```

### 关键依赖
- Electron 42 + electron-vite
- Hono 4.x（仅代理层）
- sql.js/WASM（数据库）
- TanStack Query 5.x（渲染进程数据层）
- React Router 7.x + HashRouter

## 配置
| 配置项 | 生产 | 测试 | 用途 |
|---|---|---|---|
| 数据目录 | `%APPDATA%/{appName}` | `%APPDATA%/Electron` | SQLite 数据库 + NDJSON 日志 |
| 代理端口 | `localhost:8080` | 同左 | Hono 代理服务器（仅 Chat） |
| Dev 服务器 | `localhost:5173` | — | electron-vite 开发模式前端 |
| 窗口模式 | `frame: false` | 同左 | 无边框 Electron 窗口 |

## 设计决策
| 决策 | 日期 | 理由 | 替代方案及为何不选 |
|---|---|---|---|
| 业务 CRUD 走 IPC 不走 HTTP | 2025-01 | 安全性（不暴露端口）、类型安全（preload contextBridge） | HTTP API（多一层网络开销，Electron 桌面端没必要） |
| sql.js/WASM 而非 better-sqlite3 | 2025-01 | 跨平台无需编译原生模块 | better-sqlite3（需 node-gyp，Windows 构建易失败） |
| NDJSON 日志而非 SQLite 日志表 | 2025-03 | 流式写入、无需事务、文件轮转简单 | SQLite 日志表（WAL 锁竞争影响主业务写入） |
| Hono 仅用于代理层 | 2025-02 | 轻量、标准 Web API、易做协议转换 | Express/Koa（过重，代理层只需 fetch 转发） |
| HashRouter 而非 BrowserRouter | 2025-01 | Electron 无真实 HTTP 服务器，file:// 协议不支持 History API | BrowserRouter（需要开发服务器，增加复杂度） |

## 开发陷阱
- dev 模式 data 目录：`npx electron out/main/index.js` 指向 `%APPDATA%/Electron`，需手动设路径
- 日志迁移：`node scripts/migrate-logs.mjs`（行数/文件变更时重新分片）
- 调试日志自动截断：proxy 调试日志（`llm-gateway-proxy-debug.log` 等）每次启动时自动清空
- 数据库迁移：`node scripts/migrate-db.mjs`（旧 schema 列名映射，如 `api_key_encrypted` → `api_key`）
- **SSE 解析兼容性**：上游 Provider 可能返回非标准 SSE 格式（`data:json` 无空格），所有 SSE 解析点必须兼容 `data: ` 和 `data:` 两种格式。涉及文件：`server.ts`（extractContentFromSSE、extractUsageFromSSE、convertSSEStream）、`useChatStream.ts`
- **Anthropic 认证**：Anthropic API 使用 `x-api-key` 头，OpenAI 使用 `Authorization: Bearer`，`forwarder.ts` 中按 providerType 分别处理
- 禁止任何 `window.focus()` / `document.activeElement.blur()` 等手动焦点操控 workaround
- 禁止`confirm()` / `alert()` / `window.confirm()` / `window.alert()`，用 Radix AlertDialog 组件

## 规则模块

### 通用规则（`common/` 目录，所有语言/场景适用）
| 文件 | 加载方式 | 职责 |
|------|---------|------|
| `common/00-global.md` | 始终加载 | 命名约定、注释要求 |
| `common/05-engineering.md` | 始终加载 | 架构先行、解耦、防御性编程、可读性、全局观 |

### 前端规则（`frontend/` 目录，仅 renderer 代码适用）
| 文件 | 加载方式 | 职责 |
|------|---------|------|
| `frontend/31-renderer.md` | 始终加载 | Feature 模式 + 数据流（TanStack Query、错误处理） |
| `frontend/32-component-reuse.md` | 始终加载 | 组件复用规则 |
| `frontend/35-frontend-directory.md` | 始终加载 | 目录结构 + 模块边界（导入方向、编译隔离） |
| `frontend/36-frontend-testing.md` | 按需加载 | 组件测试约定 |
| `frontend/37-visual-style.md` | 始终加载 | 视觉风格 + 样式系统（颜色、圆角、阴影、字体） |
| `frontend/38-animation.md` | 始终加载 | 动效规范（入场/退出/过渡动画） |

### 后端规则（`backend/` 目录，仅 main 进程代码适用）
| 文件 | 加载方式 | 职责 |
|------|---------|------|
| `backend/30-layered-architecture.md` | 始终加载 | 分层与依赖：层级划分、依赖方向、职责边界 |
| `backend/31-domain-modeling.md` | 始终加载 | 领域建模：服务边界、内部结构、服务间通信 |
| `backend/32-interface-contracts.md` | 始终加载 | 接口契约：输入校验、输出契约、IPC/代理规范 |
| `backend/33-data-access.md` | 始终加载 | 数据访问：查询抽象、连接管理、Schema、事务 |
| `backend/34-error-handling.md` | 始终加载 | 错误处理：错误类型、传播规则、跨边界映射 |
| `backend/35-security.md` | 始终加载 | 安全：信任边界、输入校验、API Key 保护 |
| `backend/36-observability.md` | 始终加载 | 可观测性：日志分层、格式、链路追踪、轮转 |
| `backend/37-testing.md` | 按需加载 | 测试策略：金字塔、Mock 边界、测试数据管理 |
