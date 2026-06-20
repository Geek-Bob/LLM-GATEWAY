# LLM Gateway

此文件为 Claude Code 在此仓库中工作时提供指引。

## 项目概述
- 多 LLM 供应商统一代理 + 聊天 + 仪表盘的 Electron 42 桌面客户端
- 面向需要在多个 LLM 供应商之间切换的开发者和团队
- 一次接入 OpenAI / Anthropic / 开源模型，通过本地代理做协议转换

## 代码地图（先看再动）

**`docs/ARCHITECTURE.md` 是本项目的代码地图**。接到任务后先读该文件开头「AI 架构路由提示」按任务类型定位模块，再按图索骥用 CodeGraph/LSP 做符号级检索，禁止全局盲搜。例：改 Provider CRUD → `ipc/providers.ts` → `domains/provider/` → `db/providers.ts`；改代理流式转发 → `proxy/handler.ts` → `proxy/stream.ts`；查 token 落库 → `docs/ARCHITECTURE.md#8.5` → `proxy/logger.ts` + `db/logs-stats.ts`。技术架构变更后必须同步更新该地图（铁律见下文）。

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
- 技术架构变更后必须更新 `docs/ARCHITECTURE.md`：目录结构、数据流、模块职责描述与实际代码保持一致
- 业务 CRUD 全部走 IPC（preload → ipcMain.handle）：providers / logs / stats / conversations / apiKeys
- **数据层禁止内联 SQL / 业务规则**：所有 SQLite 访问通过 `createXxxRepository(db)` 工厂函数；Repository 只做 CRUD，规则判断（not-found / 启用态 / 唯一性）由 service 层负责
- **生产环境禁止 DEBUG 日志**：`core/logger.ts` 已有 production gate，调试日志仅在 `NODE_ENV !== 'production'` 输出
- 核心原则：先统一约定(.claude/rules)、再优化结构(src)、最后微调细节。

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
- **跨进程契约一致性（铁律）**：IPC 通道的参数形态、字段命名、返回类型必须前后端一致，且类型同源派生，禁止各层各写各的。具体：
  - **参数形态对齐**：preload `ipcRenderer.invoke(channel, arg)` 传什么形态（裸值 vs 对象），handler 的 Zod schema 必须按同形态校验（裸值用 `z.number()`，对象用 `z.object({...})`）。例：`pricing:getByProvider` 传裸 `providerId`，handler 就 `z.number().int().parse(data)`，不能用 `z.object({providerId})`。
  - **字段命名统一**：同一数据流全程用同一种命名风格。LogEntry/LogResponse 等跨进程类型用 snake_case（历史日志契约），ProviderEntity/PricingEntity 等用 camelCase；service 层做 snake↔camelCase 映射后，前端类型必须与映射后形态一致，不能 service 转 camelCase 而前端按 snake_case 读。
  - **返回类型真实**：preload 声明的 `Promise<T>` 必须与 service 实际返回一致（service 返回 `PricingEntity` 就声明 `Promise<PricingEntity>`，不能写 `Promise<void>`）。
  - **类型同源**：跨进程共享的 DTO 优先在 `shared/types.ts` 定义基础 interface，preload/renderer 用 type alias 派生，禁止 preload 和 renderer 各自重复定义同名 interface。新增 IPC 通道时，先在 shared/types.ts 定类型，再写 preload 暴露 + handler 实现，三者对着同一份契约写。
  - **验证**：改 IPC 契约后必须跑 `npx tsc -b --noEmit`（前后端类型都检查），并用真实样本测一遍完整链路（IPC 调用 → service → 返回 → 前端读取字段），不能只靠理想化单元测试。

### 调用链路（核心热路径）
```
业务 CRUD：Renderer → preload IPC → ipc/index.ts → domains/{name}.service.ts → db/{entity}.ts（Repository 工厂）
Chat 代理：Renderer → HTTP (localhost:8080) → Hono proxy → upstream Provider
例外：shell/window/update 事件走 IPC
```

### 入口点
- 主进程：`src/main/index.ts`（窗口/Tray/启动；`getDb()` 在此获取后注入 `setupIpcHandlers`）
- 启动迁移：`src/main/core/config-migration.ts`（JSON 配置字段迁移框架 `applyMigrators`）
- IPC 注册：`src/main/ipc/index.ts`（全部业务 CRUD handler，按域拆分；接收入口层注入的 db）
- 渲染进程：`src/renderer/App.tsx`（路由 + 更新检测）
- 代理服务器：`src/main/proxy/server.ts`（Hono 应用）

### 基础设施模块（core/）
- `logger.ts` — 统一日志（console+file 双 transport，敏感字段脱敏，生产 DEBUG 门控）
- `config-migration.ts` — JSON 配置字段迁移框架 `applyMigrators<T>`
- `debug-log.ts` — 调试日志路径助手 `getDebugLogPath`（dev=项目根/正式包=安装目录 logs/）
- `version.ts` — 语义版本比较 `compareVersions` / `isNewerVersion`（供 update 模块防降级）

### 数据流
```
SQLite（sql.js/WASM）
  ↓ Repository 工厂
db/{entity}.ts  ← createXxxRepository(db) 模式 B 完全注入
  ↓ 业务规则 + snake_case→camelCase 映射
domains/{name}/{name}.service.ts  ← createXxxService(db) 工厂
  ↓ Zod 校验在入口
ipc/{domain}.ts  ← wrapIpcHandler 统一 try/catch
  ↓ contextBridge
preload → renderer
NDJSON 日志 → 每条请求一行 JSON，按文件轮转（轮转规格见 `36-observability.md` 日志轮转小节，勿在此重复维护）
元数据 → logs-meta.json 记录轮转计数（entryCounter / currentFileNumber / currentFileLines）
```

### 关键依赖
- Electron 42 + electron-vite
- Hono 4.x（仅代理层）
- sql.js/WASM（数据库）
- TanStack Query 5.x（渲染进程数据层）
- React Router 7.x + HashRouter
- Zod 4.x（IPC 入口 schema 验证，**注意** `z.record(keySchema, valueSchema)` 需要 2 个参数）
- rehype-sanitize 6.x（Markdown 渲染 XSS 防护，仅作用于 AI 响应等可信内容）

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
| Repository 工厂模式（模式 B 完全注入） | 2026-06 | service 内联 SQL 破坏可测试性，绕过 Repository 难 mock | 模式 A（service 调 getDb）— 破坏依赖注入链；裸函数 — 无类型契约 |
| JSON 配置迁移框架 `applyMigrators` | 2026-06 | 字段重命名时 `{...default, ...raw}` 合并会丢旧字段 | 一次性迁移脚本 — 不可复用；in-place mutate — 不幂等 |

## 开发陷阱
- dev 模式 data 目录：`npx electron out/main/index.js` 指向 `%APPDATA%/Electron`，需手动设路径
- 日志迁移：`node scripts/migrate-logs.mjs`（行数/文件变更时重新分片）
- 调试日志自动截断：proxy 调试日志（`llm-gateway-proxy-debug.log` 等）每次启动时自动清空
- 数据库迁移：`node scripts/migrate-db.mjs`（旧 schema 列名映射，如 `api_key_encrypted` → `api_key`）
- Zod 4.x API：`z.record(valueSchema)` 已废弃，必须写 `z.record(keySchema, valueSchema)`（如 `z.record(z.string(), z.unknown())`），否则 `z.string()` 会被当成 key schema
- Markdown XSS：`rehype-sanitize` 必须配合 `rehype-raw` 使用，且仅作用于可信内容（AI 响应），禁止渲染用户直接输入的 Markdown（除非服务端清洗）
- SSE 兼容性、Anthropic 认证、焦点操控等编码规范详见对应 rules/ 文件

## 规则模块
> 加载方式：frontmatter 无 `paths` 字段则始终加载；有 `paths` 字段则仅匹配路径时按需加载。此处仅为索引参考。

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
| `frontend/36-frontend-testing.md` | 始终加载 | 组件测试约定（TDD 铁律） |
| `frontend/37-visual-style.md` | 按需加载 | 视觉风格 + 样式系统（颜色、圆角、阴影、字体） |
| `frontend/38-animation.md` | 按需加载 | 动效规范（入场/退出/过渡动画） |

### 后端规则（`backend/` 目录，仅 main 进程代码适用）
| 文件 | 加载方式 | 职责 |
|------|---------|------|
| `backend/30-layered-architecture.md` | 始终加载 | 分层与依赖：层级划分、依赖方向、职责边界 |
| `backend/31-domain-modeling.md` | 始终加载 | 领域建模：服务边界、内部结构、服务间通信 |
| `backend/32-interface-contracts.md` | 始终加载 | 接口契约：输入校验、输出契约、IPC 规范 |
| `backend/33-data-access.md` | 始终加载 | 数据访问：查询抽象、连接管理、Schema、事务 |
| `backend/34-error-handling.md` | 始终加载 | 错误处理：错误类型、传播规则、跨边界映射 |
| `backend/35-security.md` | 始终加载 | 安全：信任边界、输入校验、API Key 保护 |
| `backend/36-observability.md` | 始终加载 | 可观测性：日志分层、格式、链路追踪、轮转 |
| `backend/37-testing.md` | 始终加载 | 测试策略：金字塔、Mock 边界、测试数据管理（TDD 铁律） |
| `backend/38-proxy.md` | 按需加载 | 代理层：路由、SSE 兼容性、认证头差异 |
