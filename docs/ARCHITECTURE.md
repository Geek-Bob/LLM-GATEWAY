# LLM Gateway 架构技术手册

> 技术细节手册 — 覆盖完整目录结构、数据流、模块职责和设计约定。
> 编写日期: 2026-05-30 | 最后更新: 2026-06-08 | Electron 42.x + TypeScript 6.0 + React 19.2

---

## 一、项目概述

**LLM Gateway** 是一个 Electron 桌面客户端，核心功能：
1. **多 LLM 供应商代理** — 通过本地 HTTP 服务器代理 OpenAI/Anthropic API 请求，支持自动协议转换
2. **聊天界面** — 对话式 AI 交互，支持流式 SSE 和 Mermaid 图表渲染
3. **管理仪表盘** — 供应商管理、API Key 管理、请求日志与统计
4. **模型映射** — 将客户端请求的模型名（如 `gpt-4o`）映射到实际供应商模型（如 `deepseek/deepseek-v4-pro`），支持 Agent 工具能力释放
5. **Agent 配置管理** — 管理 AI 编程助手（Claude Code/Codex/Gemini CLI 等）的配置文件，支持多 Agent 多配置版本切换

---

## 二、技术栈

### 运行时依赖

| 技术 | 用途 | 锁定版本 | 备注 |
|------|------|---------|------|
| Electron | 桌面壳 | 42.x | 无 frame，自定义 TitleBar |
| React | UI 框架 | 19.2 | 仅函数组件，禁用 class 组件 |
| React Router | 路由 | 7.x | HashRouter（Electron 无 History API） |
| TanStack Query | 数据请求 | 5.x | 数组 queryKey，禁用字符串 |
| Tailwind CSS | 样式 | 4.3 | 禁用 config 文件，Dark-only |
| Hono | HTTP 框架 | 4.x | 仅用于 proxy 服务器 |
| sql.js | 嵌入式数据库 | 1.x | WebAssembly SQLite，无需原生编译 |
| Framer Motion | 动画 | 12.x | 页面/列表过渡动画 |
| Recharts | 图表 | 3.x | 统计柱状图/面积图 |
| react-markdown | Markdown | 10.x | GFM + 代码高亮 |
| Mermaid | 图表渲染 | 11.x | 支持流程图/时序图 |
| Shiki | 代码高亮 | 4.x | 仅支持 5 种语言（ts/js/python/json/bash） |
| Radix UI | 原语组件 | — | Dialog/Select/Popover/AlertDialog 等 |
| Zod | 输入校验 | — | IPC handler 入口 schema 验证 |

### 构建工具链

| 技术 | 用途 | 锁定版本 | 备注 |
|------|------|---------|------|
| TypeScript | 语言 | 6.0 | 禁用 `enum`/`namespace`/装饰器 |
| electron-vite | 三进程构建 | 5.x | main/preload/renderer 独立构建 |
| Vite | 底层构建引擎 | 6.4 | 受 electron-vite 5.x 约束，不可独立升 8.x |
| @vitejs/plugin-react | React 支持 | 4.x | JSX 转换 + Fast Refresh |
| electron-builder | 打包分发 | 26.x | Win(NSIS)/Mac(DMG)/Linux(AppImage+deb) |
| PostCSS | CSS 处理 | 8.x | Tailwind 编译管线 |
| autoprefixer | 前缀补全 | 10.x | 浏览器兼容 |

### 代码规范

| 技术 | 用途 | 锁定版本 | 备注 |
|------|------|---------|------|
| ESLint | 代码检查 | 10.x | 禁用 `.eslintrc` 格式 |
| typescript-eslint | TS 规则 | 8.x | 类型感知 lint |
| eslint-plugin-react-hooks | Hooks 规则 | 7.x | 依赖数组检查 |
| eslint-plugin-react-refresh | HMR 规则 | 0.5.x | 组件导出检查 |

### 测试

| 技术 | 用途 | 锁定版本 | 备注 |
|------|------|---------|------|
| Vitest | 测试框架 | 4.x | 兼容 Jest API，原生 ESM |
| jsdom | DOM 环境 | 29.x | 无浏览器的 DOM 模拟 |
| @testing-library/react | 组件测试 | 16.x | 用户行为驱动的测试 API |
| @testing-library/jest-dom | DOM 断言 | 6.x | toBeInTheDocument 等 |

---

## 三、目录结构（完整）

```
e:\code\llm-gateway\
├── src/
│   ├── main/                            # Electron 主进程
│   │   ├── index.ts                     # 入口：窗口/Tray/启动
│   │   ├── core/
│   │   │   └── logger.ts                # 统一日志接口（createLogger 工厂，console+file 双 transport）
│   │   ├── ipc/                         # 接口层：IPC handler（按域拆分文件）
│   │   │   ├── index.ts                 # IPC handler 注册入口（getDb + 工厂注入）
│   │   │   ├── agents.ts                # Agent IPC handler
│   │   │   ├── apikeys.ts               # API Key IPC handler
│   │   │   ├── conversations.ts         # 对话 IPC handler
│   │   │   ├── logs.ts                  # 日志 IPC handler
│   │   │   ├── models.ts                # 模型映射 IPC handler
│   │   │   ├── providers.ts             # 供应商 IPC handler
│   │   │   ├── proxy.ts                 # 代理控制 IPC handler
│   │   │   ├── stats.ts                 # 统计 IPC handler
│   │   │   ├── system.ts                # 系统 IPC handler（window/debug）
│   │   │   └── sse-parser.ts            # SSE 解析工具函数
│   │   ├── db/                          # 数据层（sql.js，返回 snake_case）
│   │   │   ├── connection.ts            # 连接管理（单例模式）
│   │   │   ├── database.ts              # sql.js 封装（Statement/Database 类）
│   │   │   ├── schema.ts                # 建表 DDL（9 张表）
│   │   │   ├── providers.ts             # Provider CRUD（返回 ProviderRow snake_case）
│   │   │   ├── api-keys.ts              # API Key CRUD + 生成/校验
│   │   │   ├── conversations.ts         # 对话/消息 CRUD
│   │   │   ├── model-mappings.ts        # 模型映射 CRUD（返回 ModelMappingRow snake_case）
│   │   │   ├── logs-reader.ts           # NDJSON 日志读取（queryLogs/readTailLines）
│   │   │   ├── logs-writer.ts           # NDJSON 日志写入（createLogEntry/轮转/元数据）
│   │   │   ├── logs-stats.ts            # 日志统计（getLogStats/getDetailedStats）
│   │   │   ├── agents.ts               # Agent CRUD（返回 AgentRow snake_case）
│   │   │   └── agent-configs.ts         # Agent 配置版本 CRUD
│   │   ├── domains/                     # 业务层（domain 模式，service 做 snake_case→camelCase）
│   │   │   ├── provider/
│   │   │   │   ├── provider.types.ts    # Provider 类型定义（camelCase）
│   │   │   │   ├── provider.schema.ts   # Provider Zod 校验
│   │   │   │   └── provider.service.ts  # Provider 业务逻辑（含 row 映射）
│   │   │   ├── apikey/
│   │   │   │   ├── apikey.types.ts      # API Key 类型定义
│   │   │   │   ├── apikey.schema.ts     # API Key Zod 校验
│   │   │   │   └── apikey.service.ts    # API Key 业务逻辑（委托 db/api-keys.ts）
│   │   │   ├── conversation/
│   │   │   │   ├── conversation.types.ts  # 对话/消息类型
│   │   │   │   ├── conversation.schema.ts # 对话 Zod 校验
│   │   │   │   └── conversation.service.ts # 对话业务逻辑
│   │   │   ├── models/
│   │   │   │   ├── models.types.ts      # 模型映射类型
│   │   │   │   ├── models.schema.ts     # 模型映射 Zod 校验
│   │   │   │   └── models.service.ts    # 模型列表 + 映射 CRUD
│   │   │   ├── agent/
│   │   │   │   ├── agent.types.ts       # Agent 类型
│   │   │   │   ├── agent.schema.ts      # Agent Zod 校验（6 个 schema）
│   │   │   │   └── agent.service.ts     # Agent + 配置版本业务逻辑
│   │   │   ├── logs/
│   │   │   │   ├── logs.types.ts        # 日志类型定义
│   │   │   │   ├── logs.schema.ts       # 日志 Zod 校验
│   │   │   │   └── logs.service.ts      # 日志业务逻辑
│   │   │   └── stats/
│   │   │       ├── stats.types.ts       # 统计类型定义
│   │   │       ├── stats.schema.ts      # 统计 Zod 校验
│   │   │       └── stats.service.ts     # 统计业务逻辑
│   │   ├── proxy/                       # 接口层：HTTP 代理（Hono 服务器）
│   │   │   ├── server.ts                # Hono 应用定义（路由/中间件，~120 行）
│   │   │   ├── handler.ts               # 代理请求处理（10 个子函数，均≤50 行）
│   │   │   ├── stream.ts                # SSE 流转换服务（7 个子函数，均≤50 行）
│   │   │   ├── logger.ts                # 代理调试日志（tryLogEntry/logAuthFailure）
│   │   │   ├── manager.ts               # 代理生命周期管理
│   │   │   ├── router.ts                # 模型ID → 供应商路由解析
│   │   │   ├── forwarder.ts             # 上游 URL/Header 构建
│   │   │   ├── converter/               # OpenAI ↔ Anthropic 协议转换
│   │   │   │   ├── types.ts             # StreamContext、ProtocolFormat 共享类型
│   │   │   │   ├── request.ts           # convertRequest() 双向请求转换（20 个辅助函数，均≤50 行）
│   │   │   │   ├── response.ts          # convertResponse() 非流式响应转换
│   │   │   │   ├── sse.ts               # convertSSEEvent() + SSE 状态机（12 个格式化函数）
│   │   │   │   └── index.ts             # barrel export
│   │   │   ├── middleware.ts            # Auth 中间件（Bearer token 提取）
│   │   │   └── rate-limiter.ts          # 滑动窗口限流器
│   │   └── update/                      # 自动更新模块
│   │       ├── manager.ts               # electron-updater 封装
│   │       ├── config.ts                # 更新配置持久化
│   │       └── ipc.ts                   # 更新相关 IPC handler
│   │
│   ├── preload/
│   │   ├── index.ts                     # contextBridge 暴露 IPC 到渲染进程
│   │   └── types.ts                     # 预加载层类型定义（ElectronAPI 接口）
│   │
│   ├── renderer/                        # React 渲染进程
│   │   ├── main.tsx                     # 入口：QueryClientProvider 初始化
│   │   ├── App.tsx                      # 根组件：路由 + 更新事件监听
│   │   ├── pages/                       # 页面组件（薄层组合，路由级代码分割）
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Providers.tsx
│   │   │   ├── ApiKeys.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── ModelMappings.tsx
│   │   │   ├── Agents.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/                  # 共享 UI 组件
│   │   │   ├── Layout.tsx               # 应用布局（侧边栏导航 + TitleBar）
│   │   │   ├── TitleBar.tsx             # 自定义窗口标题栏
│   │   │   ├── ErrorBoundary.tsx        # React 错误边界
│   │   │   └── ui/                      # shadcn/ui 风格基础组件（30+ 个）
│   │   │       ├── button.tsx, card.tsx, dialog.tsx, input.tsx, select.tsx, ...
│   │   │       ├── action-buttons.tsx   # 通用操作按钮组（编辑/删除）
│   │   │       ├── form-dialog.tsx      # 通用表单对话框布局
│   │   │       ├── page-header.tsx      # 页面标题组件
│   │   │       ├── empty-state.tsx      # 空状态占位
│   │   │       ├── status-badge.tsx     # 状态标签（活跃/已停用）
│   │   │       ├── pagination.tsx       # 分页组件
│   │   │       ├── table-skeleton.tsx   # 表格骨架屏
│   │   │       ├── code-editor.tsx      # Monaco 代码编辑器
│   │   │       ├── markdown.tsx         # Markdown 渲染（Shiki 高亮 + Mermaid）
│   │   │       └── mermaid.tsx          # Mermaid 图表渲染组件
│   │   ├── features/                    # 功能域组件（按 feature 划分）
│   │   │   ├── chat/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ChatMessage.tsx    # 聊天气泡组件
│   │   │   │   │   ├── ChatInputArea.tsx  # 聊天输入框
│   │   │   │   │   ├── MessageList.tsx    # 消息列表
│   │   │   │   │   └── ConversationSidebar.tsx # 会话历史侧边栏
│   │   │   │   └── hooks/
│   │   │   │       ├── useChatStream.ts   # 聊天 SSE 流读取 hook
│   │   │   │       ├── useChatPage.ts     # 聊天页状态管理 hook
│   │   │   │       └── useConversationManager.ts # 会话 CRUD 逻辑 hook
│   │   │   ├── agent/
│   │   │   │   └── components/
│   │   │   │       ├── AgentList.tsx      # Agent 列表
│   │   │   │       └── AgentFormDialog.tsx # Agent 表单弹窗
│   │   │   ├── apikey/
│   │   │   │   └── components/
│   │   │   │       ├── ApiKeyList.tsx     # API Key 列表
│   │   │   │       └── ApiKeyFormDialog.tsx # API Key 表单弹窗
│   │   │   ├── provider/
│   │   │   │   └── components/
│   │   │   │       ├── ProviderList.tsx   # 供应商列表
│   │   │   │       └── ProviderFormDialog.tsx # 供应商表单弹窗
│   │   │   ├── model-mapping/
│   │   │   │   └── components/
│   │   │   │       ├── MappingList.tsx    # 模型映射列表
│   │   │   │       └── MappingFormDialog.tsx # 模型映射表单弹窗
│   │   │   ├── dashboard/
│   │   │   │   └── components/
│   │   │   │       ├── DashboardStats.tsx # 统计卡片
│   │   │   │       ├── ProxyControlCard.tsx # 代理控制卡片
│   │   │   │       ├── StatsSummaryTable.tsx # 统计汇总表
│   │   │   │       ├── TimeTrendAccordion.tsx # 趋势图折叠面板
│   │   │   │       ├── StatsCard.tsx      # 统计卡片
│   │   │   │       └── StatusBar.tsx      # 代理状态指示
│   │   │   └── update/
│   │   │       └── components/
│   │   │           ├── UpdateDialog.tsx   # 更新确认弹窗
│   │   │           ├── UpdateButton.tsx   # 检查更新按钮
│   │   │           └── DownloadProgress.tsx # 下载进度组件
│   │   ├── hooks/                       # 全局通用 hooks
│   │   │   ├── useClipboard.ts          # 剪贴板复制 hook
│   │   │   ├── useDeleteWithToast.ts    # 带 toast 的删除操作 hook
│   │   │   ├── useSavingAction.ts       # 保存操作 hook
│   │   │   └── useUpdateCheck.ts        # 自动更新检查 hook
│   │   ├── lib/
│   │   │   ├── ipc.ts                   # window.electronAPI 快捷导出
│   │   │   ├── types.ts                 # 类型定义 + Window 全局声明
│   │   │   ├── utils.ts                 # cn/formatDate/getErrorMessage 工具函数
│   │   │   ├── animations.ts            # framer-motion 动画常量
│   │   │   ├── api-client.ts            # HTTP 统一封装（仅 Chat SSE 流使用）
│   │   │   ├── shiki.ts                 # Shiki 代码高亮辅助
│   │   │   └── queries/                 # TanStack Query hooks
│   │   │       ├── providers.ts         # 供应商 queries
│   │   │       ├── apiKeys.ts           # API Key queries
│   │   │       ├── conversations.ts     # 对话 queries
│   │   │       ├── logs.ts              # 日志 queries
│   │   │       ├── stats.ts             # 统计 queries
│   │   │       ├── proxy.ts             # 代理状态 queries
│   │   │       ├── update.ts            # 更新 queries
│   │   │       ├── modelMappings.ts     # 模型映射 queries
│   │   │       └── agents.ts            # Agent queries
│   │
│   └── shared/                          # 主/渲染进程共享类型
│       └── types.ts                     # 核心实体定义（Provider/Agent/ModelMapping/...）
│
├── scripts/
│   ├── migrate-db.mjs                   # 数据库 schema 迁移
│   ├── migrate-logs.mjs                 # 日志文件分片迁移
│   ├── test-chat-endpoint.ts            # 代理端点集成测试脚本
│   └── test-*.mjs                       # 日志调试脚本（3 个）
│
├── .claude/rules/                       # Claude Code 规则模块（16 个）
│   ├── common/                          # 通用规则（2 个）
│   │   ├── 00-global.md                 # 命名约定、注释要求
│   │   └── 05-engineering.md            # 架构先行、解耦、防御性编程
│   ├── frontend/                        # 前端规则（6 个）
│   │   ├── 31-renderer.md               # Feature 模式 + 数据流
│   │   ├── 32-component-reuse.md        # 组件复用规则
│   │   ├── 35-frontend-directory.md     # 目录结构 + 模块边界
│   │   ├── 36-frontend-testing.md       # 组件测试约定
│   │   ├── 37-visual-style.md           # 视觉风格 + 样式系统
│   │   └── 38-animation.md              # 动效规范
│   └── backend/                         # 后端规则（8 个）
│       ├── 30-layered-architecture.md   # 分层与依赖
│       ├── 31-domain-modeling.md        # 领域建模（模式 A/B 说明）
│       ├── 32-interface-contracts.md    # 接口契约
│       ├── 33-data-access.md            # 数据访问
│       ├── 34-error-handling.md         # 错误处理
│       ├── 35-security.md               # 安全
│       ├── 36-observability.md          # 可观测性
│       └── 37-testing.md                # 测试策略
│
└── docs/
    ├── ARCHITECTURE.md                  # 本文档
    ├── standards/
    │   └── ui-standards.md              # UI 设计规范
    └── superpowers/                     # 设计文档/计划（SDD/TDD）
        └── plans/                       # 工作流脚本
```

---

## 四、数据流架构

### 4.1 总体流程

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer 进程（React）                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  pages/*         │  │  queries/*      │  │  features/chat/* │   │
│  │  (页面组件)       │◄─│  (TanStack Query)│  │  (useChatStream) │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘   │
│           │                    │                     │              │
│           ▼                    ▼                     ▼              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  lib/ipc.ts (window.electronAPI)         lib/api-client.ts  │  │
│  │  IPC 通信通道                             HTTP 直连 Hono    │  │
│  │  (预加载桥接)                              (仅 Chat 流)      │  │
│  └────────┬──────────────┬──────────────────────┬──────────────┘  │
└───────────┼──────────────┼──────────────────────┼──────────────────┘
            │              │                      │
            ▼              ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Main 进程（Electron）                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ ipc/     │  │ db/      │  │ domains/     │  │ proxy/        │ │
│  │ index.ts │─►│ (sql.js) │─►│ (业务逻辑)    │  │ server.ts     │ │
│  │ (handler)│  │          │  │              │  │ (Hono)        │ │
│  └──────────┘  └──────────┘  └──────────────┘  └───────┬───────┘ │
│                                                         │         │
└─────────────────────────────────────────────────────────┼─────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────┐
                                               │  上游 LLM API     │
                                               │ (OpenAI/Anthropic)│
                                               └──────────────────┘
```

### 4.2 两条通信路线

| 路线 | 用途 | 协议 | 通道 |
|------|------|------|------|
| **业务 CRUD** | Provider/API Key/对话/日志/模型映射/Agent CRUD | IPC | lib/ipc.ts → preload → ipcMain.handle |
| **Chat 流式** | 聊天 SSE 流 | HTTP | api-client.ts → Hono server (8080) → upstream |

### 4.3 模型映射数据流

```
客户端请求 model="gpt-4o"
  │
  ▼
handleProxyRequest()（handler.ts 编排器）
  │ resolveRoute()
  │   → modelsService.findModelMapping("gpt-4o")
  │   → 查找 model_mappings 表 WHERE source_model = "gpt-4o" AND is_active = 1
  │   → 命中: { targetModel: "deepseek/deepseek-v4-pro" }
  │   → 未命中: 使用原始 model 名
  │
  ▼
resolvedModel = "deepseek/deepseek-v4-pro"
  │
  ▼
resolveProvider("deepseek/deepseek-v4-pro")
  │ parseModelId → prefix="deepseek", modelName="deepseek-v4-pro"
  │ getProviderByName("deepseek") → Provider 记录
  │ 验证 isActive + models 白名单
  │
  ▼
正常代理流程（协议转换 → 上游请求 → 响应透传）
```

**核心价值：** Agent 工具（Claude Code、Cursor、Windsurf）只认官方模型 ID（如 `claude-sonnet-4`），通过模型映射可以伪装成官方 ID，实际路由到第三方供应商，释放 Agent 全部能力。

### 4.4 Chat 流式数据流（完整链路）

```
Chat.tsx
  │ handleSend() 调用
  ▼
useChatStream.ts
  │ apiFetch('/v1/chat/completions', POST) 或 apiFetch('/v1/messages', POST)
  ▼
Hono server (8080)
  │ auth middleware (验证 gateway API key)
  │ rate-limit middleware
  ▼
handleProxyRequest()（handler.ts 编排器）
  │ resolveRoute() → findModelMapping + resolveProvider + convertIfNeeded
  │ buildAndFetchUpstream() → fetch(upstream)
  ▼
上游 LLM API（OpenAI / Anthropic）
  │ SSE 流响应
  ▼
handleStreamResponse() — convertSSEStream()（如需） → SSE 透传
  │ 标准 OpenAI SSE 或 Anthropic SSE
  ▼
useChatStream.ts (ReadableStream 消费)
  │ 按 providerType 分路由解析 SSE → contentAcc / thinkingAcc
  ▼
Chat.tsx (handleStreamUpdate)
  │ setMessages → 气泡渲染
  ▼
ChatMessage.tsx + Markdown 组件
  │ Markdown 渲染 + Shiki 代码高亮 + Mermaid 图表
```

### 4.5 Agent 配置数据流

```
Agents.tsx
  │ 选择 Agent → 加载配置列表
  ▼
lib/queries/agents.ts
  │ useAgentConfigs(agentId) → IPC agent:listConfigs
  ▼
ipc/agents.ts
  │ agentService.listConfigs(agentId)
  ▼
domains/agent/agent.service.ts
  │ db/agent-configs.ts → agent_configs 表查询
  ▼
返回配置列表 → CodeEditor 编辑
  │
  │ 保存 → agent:updateConfig IPC → agent_configs 表更新
  │ 切换 → agent:switchConfig IPC → agent_configs.is_current 更新
```

---

## 五、各层详解

### 5.1 数据库层 (src/main/db/)

**技术选择：** sql.js（WebAssembly SQLite），无独立进程，与 Electron 主进程同进程运行。

**database.ts** — 核心封装（268 行）：
- `Database` 类封装 sql.js 原始实例，提供 `prepare()` / `exec()` / `pragma()` 方法
- `Statement` 类封装预编译语句，提供 `run()` / `get()` / `all()` 方法
- 参数绑定自动处理：camelCase → `@paramName` 前缀转换
- 写防抖（save）：频繁写入（如统计更新）合并为 2 秒一次磁盘写入
- `:memory:` 路径特殊处理，不持久化

**连接管理：**
```
initDatabase(path) → 创建 Database 实例（单例）
    │
getDb()            → 获取当前实例（未初始化则抛错）
    │
closeDatabase()    → 保存 + 关闭
```

**schema.ts** — 9 张表：

| 表 | 主键 | 用途 |
|----|------|------|
| `providers` | id | LLM 供应商配置（API Key、模型列表） |
| `model_mappings` | id | 模型名称映射（source_model → target_model，UNIQUE 约束） |
| `api_keys` | id | Gateway API 密钥（SHA256 哈希 + 明文） |
| `request_stats` | (stat_date, stat_hour) | 请求统计汇总 |
| `request_stats_provider` | (stat_date, stat_hour, provider_id, model) | 按供应商/模型统计 |
| `conversations` | id | 对话列表 |
| `messages` | id | 对话消息（外键关联 conversations，CASCADE 删除） |
| `agents` | id | AI Agent 配置（name UNIQUE、config_path、config_format） |
| `agent_configs` | id | Agent 配置版本（agent_id FK CASCADE、is_current 标记、UNIQUE(agent_id, name)） |

**model-mappings.ts** — 模型映射 CRUD：
- `findModelMapping(sourceModel)` → 按 source_model 精确匹配活跃映射
- `listModelMappings() / createModelMapping(input) / updateModelMapping(id, data) / deleteModelMapping(id)`
- **数据层返回 `ModelMappingRow`（snake_case）**

**providers.ts** — 供应商 CRUD 函数：
- `createProvider(input)` → 插入新供应商，返回 ID
- `getProvider(id) / getProviderByName(name)` → 按 ID 或名称查询，返回 `ProviderRow`（snake_case）
- `listProviders() / listActiveProviders()` → 全量/仅活跃
- `updateProvider(id, updates)` → 动态列映射更新（camelCase → snake_case）
- `deleteProvider(id)` → 按 ID 删除
- 使用 `JSON.stringify` 存储 models 数组
- **数据层返回 snake_case**（`ProviderRow`），camelCase 映射由 service 层完成

**api-keys.ts** — API Key 管理函数（148 行）：
- `generateApiKey()` → 生成 `sk-` 前缀 + 36 字节 base64url 随机字符串
- `hashKey()` → SHA256 哈希
- `createApiKey(name, rateLimit)` → 插入新 key，返回明文 + 公钥信息
- `verifyApiKey(plaintextKey)` → 验证 key 有效性（哈希匹配 + is_active）
- `listApiKeys()` → 列出所有 key（含明文）
- `deleteApiKey(id)` → 按 ID 删除

**conversations.ts** — 对话/消息 CRUD 函数（160 行）：
- `listConversations()` → 按 updated_at 降序
- `createConversation(title, model, providerId, apiKeyId)` → 插入新对话
- `updateConversation(id, data)` → 动态字段更新
- `getConversation(id)` → 查询单条
- `deleteConversation(id)` → 按 ID 删除（CASCADE 删除关联消息）
- `listMessages(conversationId)` → 查询对话下所有消息
- `addMessage(conversationId, role, content, thinking)` → 添加消息 + 更新对话时间

**agents.ts** — Agent CRUD（Repository 模式）：
- `createAgentRepository(db)` → 返回 Repository 实例
- `create(input) / getById(id) / getByName(name) / list() / update(id, data) / remove(id)`
- **数据层返回 `AgentRow`（snake_case）**，camelCase 映射由 service 层完成

**agent-configs.ts** — Agent 配置版本 CRUD（221 行）：
- `createAgentConfigRepository(db)` → 返回 Repository 实例
- `create(input) / getById(id) / listByAgent(agentId) / getCurrent(agentId) / update(id, data) / remove(id) / switchCurrent(agentId, configId)`
- `switchCurrent` 事务内先清除旧 is_current，再设置新 is_current

**logs-writer.ts** — NDJSON 日志写入：
- **分片策略：** 每个 NDJSON 文件最多 500 行，最多保留 20 个文件（10000 条上限）
- 文件命名：`logs-0001.ndjson`、`logs-0002.ndjson` ...
- 循环覆盖：超过 20 个文件时删除最旧的
- **元数据持久化（logs-meta.json）：** `entryCounter`、`currentFileNumber`、`currentFileLines` 三个计数器通过 `loadMeta()` / `saveMeta()` 持久化到 `logs-meta.json`
- `createLogEntry(entry)` → 追加一行 NDJSON → 调用 `saveMeta()` 持久化计数器

**logs-reader.ts** — NDJSON 日志读取：
- `queryLogs(query)` → 读取所有文件 → 过滤 → 分页
- `normalizeEntry()` 处理新旧字段名兼容
- 文件描述符操作均在 `finally` 块中调用 `fs.closeSync(fd)` 防止泄漏

**logs-stats.ts** — 日志统计：
- `getLogStats(db, opts)` → 从 SQLite `request_stats` 表聚合（24h/7d/30d）
- `getDetailedStats(range)` → 按供应商/模型分组统计
- `updateRequestStats(entry)` / `updateProviderStats(entry)` → 写入统计汇总

---

### 5.2 代理层 (src/main/proxy/)

**Hono 服务器** 监听 `127.0.0.1:8080`，提供：

**路由表：**

| 路由 | 方法 | 用途 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 格式代理 |
| `/v1/messages` | POST | Anthropic 格式代理 |
| `/v1/models` | GET | 查询可用模型列表 |
| `/health` | GET | 健康检查 |

**中间件链：**
1. **CORS** — 允许所有来源
2. **Auth** — 从 `Authorization: Bearer <key>` 或 `X-Api-Key` 头提取 token → `verifyApiKey()`
3. **Rate Limit** — 按 API Key 滑动窗口限流（默认 60 次/分钟）

**server.ts** — Hono 应用定义（~120 行）：
- 路由注册 + 中间件链（CORS/Auth/RateLimit）
- 委托给 `handler.ts` 处理代理请求

**handler.ts** — 代理请求处理（拆分为 10 个子函数，均≤50 行）：
- `extractClientHeaders(headers)` — 提取并脱敏客户端请求头（authorization + x-api-key）
- `resolveRoute(modelId, apiKey)` — 模型映射 + 供应商匹配 + 协议转换
- `buildUpstreamHeaders(route, clientHeaders)` — 构建上游请求头
- `buildAndFetchUpstream(route, body, headers)` — 构建 URL + fetch 上游
- `convertIfNeeded(body, route)` — 请求体协议格式转换
- `handleStreamResponse(response, route, debugInfo)` — 流式 SSE 响应处理
- `handleNonStreamResponse(response, route, debugInfo)` — 非流式 JSON 响应处理
- `handleErrorResponse(response, route, debugInfo)` — 上游错误响应处理
- `handleProxyRequest(request)` — 编排器：解析 → 路由 → fetch → 分发
- `handleProxyError(err)` — 异常处理

**stream.ts** — SSE 流转换服务（拆分为 7 个子函数，均≤50 行）：
- `encodeSSEEvent(event)` — 编码单个 SSE 事件
- `processSSEDataLine(line, state)` — 处理 `data:` 行
- `processSSELine(line, state)` — 处理单行（event/data/空行）
- `flushBuffer(buffer, controller)` — 刷新缓冲区
- `enqueueResults(results, controller)` — 入队转换结果
- `convertSSEStream(stream, context)` — 主转换函数（编排器）

**logger.ts** — 代理调试日志：
- `tryLogEntry(entry)` — 尽力写入日志（容错，失败仅 debug 记录）
- `logAuthFailure(request, token)` — 记录认证失败

**router.ts** — 模型路由解析：
- 模型 ID 格式：`{provider-name}/{model-id}`（例如 `openai/gpt-4`）
- `parseModelId()` → 分割前缀和模型名
- `resolveProvider()` → 按名称查找供应商 → 验证活跃状态 → 验证模型在白名单中
- `getAllModels()` 已迁移至 `domains/models/models.service.ts`

**forwarder.ts** — 上游请求构建（74 行）：
- `buildProxyUrl()` → 检测并去重重叠路径（如 `baseUrl` 以 `/v1` 结尾，path 以 `/v1` 开头）
- `buildProxyHeaders()` → 注入 Authorization 请求头，Anthropic 额外添加 `anthropic-version`

**converter/ 目录** — 协议转换（关键复杂模块，拆分为 5 文件）：
- `types.ts` — StreamContext、ProtocolFormat 等共享类型
- `request.ts` — `convertRequest()` 双向请求转换（拆分为 20 个辅助函数，均≤50 行）
  - OpenAI → Anthropic：`extractSystemBlocks`、`mergeConsecutiveMessages`、`convertMessages`、`convertTools`、`applyWebSearch`、`applyResponseFormat`
  - Anthropic → OpenAI：`extractSystemMessage`、`parseContentBlocks`、`convertAnthropicMessages`、`convertAnthropicTools`
- `response.ts` — `convertResponse()` 非流式响应转换
- `sse.ts` — `convertSSEEvent()`、`createStreamContext()`、双方向 SSE 状态机（拆分为 12 个格式化函数）
  - `anthropicSSEToOpenAI()`：按事件类型分发（message_start/content_block_start/content_block_delta/message_delta）
  - `openAISSEToAnthropic()`：按事件类型分发（含 reasoning/tool_calls/finish_reason 处理）
- `index.ts` — barrel export，保持向前兼容

**rate-limiter.ts** — 滑动窗口限流器（63 行）：
- 内存 Map 存储每个 key 的时间戳数组
- `check(key, limit)` → 清理过期戳 → 比较上限 → 返回 { allowed, remaining, resetAt }
- 超限时自动调度删除 key 的清理

**middleware.ts** — 简单的 auth 提取（20 行）：
- `authMiddleware(authHeader)` → 从 Bearer token 提取纯 token 字符串

---

### 5.3 业务域层 (src/main/domains/)

Domain 模式：每个业务域一个目录，包含 `*.types.ts`、`*.service.ts`、`*.schema.ts`（可选，Zod 校验）。

**IPC → service → db 三层已激活**：IPC handler 按域拆分文件，全部委托到 domain service，不再直调 `db/` 函数。

设计原则：
- **service 是业务逻辑层** — 封装数据转换（snake_case → camelCase）和聚合，不操作 Request/Response
- **每个 domain 只有一个 service** + types + schema 三件套
- **service 通过工厂函数创建** `createXxxService(_db: Database)`，内部委托给 `db/*.ts` 数据层函数（模式 A）
- **schema 在 IPC 入口验证输入** — Zod `.parse()` 拦截非法数据，保护 service 层
- **数据层返回 snake_case**（`ProviderRow`、`AgentRow` 等），service 层做 camelCase 映射

**models domain：**
- `models.service.ts` — 工厂注入模式 `createModelsService(db)`，与 provider/conversation/agent 统一
- `getAllModels()` — 聚合所有活跃 provider 的模型列表，从 `proxy/router.ts` 迁移而来
- `findModelMapping(sourceModel)` — 按 sourceModel 精确匹配活跃映射，供 proxy 请求转换时调用
- `listModelMappings/createModelMapping/updateModelMapping/deleteModelMapping` — model_mappings 表 CRUD

**agent domain：**
- `agent.service.ts`（222 行）— Agent + 配置版本管理
  - `list / getById / create / update / remove` — Agent CRUD
  - `listConfigs / getConfig / createConfig / updateConfig / deleteConfig / switchConfig` — 配置版本管理
  - 内部依赖：`db/agents.ts`（Agent Repository）+ `db/agent-configs.ts`（Config Repository）
- `agent.schema.ts`（43 行）— 6 个 Zod schema：`createAgentSchema`、`updateAgentSchema`、`createAgentConfigSchema`、`updateAgentConfigSchema`、`switchConfigSchema`、`configFormatSchema`
- `agent.types.ts`（21 行）— 从 `shared/types.ts` re-export 所有 Agent 相关类型

**provider domain：**
- `provider.service.ts` 委托给 `db/providers.ts` 数据层函数，service 层做 snake_case → camelCase 映射
- `list/getById/create/update/remove` 标准 5 个方法

**apikey domain：**
- `apikey.service.ts` 委托给 `db/api-keys.ts` 数据层函数
- `list/getById/create/remove` 4 个方法

**conversation domain：**
- `conversation.service.ts` 委托给 `db/conversations.ts` 数据层函数
- `list/getById/create/update/remove/messages/addMessage` 7 个方法

**logs domain：**
- `logs.service.ts` 委托给 `db/logs-reader.ts`、`db/logs-stats.ts` 数据层函数
- `logs.types.ts` — 日志类型定义（`LogQueryParams`、`LogStatsResponse` 等）
- `logs.schema.ts` — 日志 Zod 校验
- `query/stats/detailedStats` 3 个方法

**stats domain：**
- `stats.service.ts` 委托给 `db/logs-stats.ts`，仅暴露 `summary` 方法
- `stats.types.ts` — 统计类型定义
- `stats.schema.ts` — 统计 Zod 校验（`statsRangeSchema`）

---

### 5.4 IPC 层 (src/main/ipc/)

**ipc/index.ts** — IPC handler 注册入口，按域拆分为独立文件（共 40 个 IPC 通道）：

| 通道 | 委托到 | handler 文件 |
|------|--------|-------------|
| `provider:list/getById/create/update/delete` | `providerService.*` | `providers.ts` |
| `apikey:list/create/delete` | `apiKeyService.*` | `apikeys.ts` |
| `logs:list/stats/statsDetailed` | `logsService.*` / `statsService.*` | `logs.ts` |
| `window:minimize/maximize/close` | BrowserWindow 操作 | `system.ts` |
| `proxy:get/start/stop/restart/updatePort/update` | `proxy/manager.ts` | `proxy.ts` |
| `renderer:log` | `logger.debug()` | `system.ts` |
| `conversation:list/create/update/delete/getById/listMessages/createMessage` | `conversationService.*` | `conversations.ts` |
| `models:list` | `modelsService.getAllModels()` | `models.ts` |
| `models:mapping:find/list/create/update/delete` | `modelsService.*` | `models.ts` |
| `agent:list/getById/create/update/delete` | `agentService.*` | `agents.ts` |
| `agent:listConfigs/getConfig/createConfig/updateConfig/deleteConfig/switchConfig` | `agentService.*` | `agents.ts` |
| `update:check/download/install/skipVersion/getConfig/setConfig/getCurrentVersion` | `update/manager.ts` | `update/ipc.ts` |

**sse-parser.ts** — SSE 解析工具（129 行）：
- `parseSSELine()` 解析单行 SSE 文本
- `tryExtractText()` 从 Anthropic SSE 对象提取 text/thinking
- `extractFromAnthropicSSE()` / `extractFromOpenaiSSE()` 解析 JSON 行
- `parseAnthropicSSE()` / `parseOpenaiSSE()` 解析完整 SSE 文本

---

### 5.5 预加载层 (src/preload/)

**index.ts** 通过 `contextBridge.exposeInMainWorld` 暴露 `window.electronAPI`（178 行）：

```
electronAPI = {
  backend.isReady() / onReady(),
  debug.log(),
  providers.list/getById/create/update/delete(),
  apiKeys.list/create/delete(),
  logs.list/stats/statsDetailed(),
  conversations.list/create/update/delete/getById/listMessages/createMessage(),
  proxy.get/start/stop/restart/updatePort/update(),
  window.minimize/maximize/close(),
  update.check/download/install/skipVersion/getConfig/setConfig/
         getCurrentVersion/
         onAvailable/onProgress/onDownloaded/onError(),
  models.list(),
  models.mapping.find/list/create/update/delete(),
  agents.list/getById/create/update/delete(),
  agents.listConfigs/getConfig/createConfig/updateConfig/deleteConfig/switchConfig(),
}
```

---

### 5.6 渲染进程 (src/renderer/)

**main.tsx** — 入口：
- TanStack QueryClient 初始化（staleTime 30s，无 refetchOnWindowFocus，无 retry）
- Query 错误日志自动订阅

**App.tsx** — 根组件：
- **启动门控：** 通过 IPC 监听主进程 `backend:ready` 事件，后端未就绪时显示 "正在初始化服务..." loading 界面
- **路由级代码分割：** 8 个页面组件使用 `React.lazy(() => import(...))` 动态加载，`Suspense` 包裹路由出口
- HashRouter + Routes 路由配置
- 更新事件监听（available/progress/downloaded/error）

**Pages：**

| 页面 | 路由 | 主要功能 |
|------|------|---------|
| Dashboard | `/` | 代理开关/端口、4 个统计卡片、调用统计表、30 天趋势图 |
| Providers | `/providers` | CRUD 表格、API Key 查看/复制、模型列表管理 |
| ApiKeys | `/api-keys` | 两步创建（表单→展示明文）、删除确认 |
| Logs | `/logs` | 分页表格、Debug 模式切换、展开详情面板 |
| Chat | `/chat` | 会话列表、供应商/模型/API Key 选择、消息流式渲染 |
| ModelMappings | `/model-mappings` | 模型名称映射 CRUD、状态切换 |
| Agents | `/agents` | Agent 配置管理、CodeEditor 编辑 JSON/TOML/ENV 配置、多配置版本切换 |
| Settings | `/settings` | 自动更新开关、预发布版本开关、版本信息 |

**Features（功能域组件）：**

| Feature | 组件 | 说明 |
|---------|------|------|
| `chat/` | ChatMessage, ChatInputArea, MessageList, ConversationSidebar | 聊天核心组件 |
| `chat/hooks/` | useChatStream, useChatPage, useConversationManager | SSE 流 + 页面状态 + 会话管理 |
| `agent/` | AgentList, AgentFormDialog | Agent CRUD 列表+表单 |
| `apikey/` | ApiKeyList, ApiKeyFormDialog | API Key CRUD 列表+表单 |
| `provider/` | ProviderList, ProviderFormDialog | 供应商 CRUD 列表+表单 |
| `model-mapping/` | MappingList, MappingFormDialog | 模型映射 CRUD 列表+表单 |
| `dashboard/` | DashboardStats, ProxyControlCard, StatsSummaryTable, TimeTrendAccordion, StatsCard, StatusBar | 仪表盘统计 |
| `update/` | UpdateDialog, UpdateButton, DownloadProgress | 自动更新 UI |

**全局 Hooks（`hooks/` 目录）：**

| Hook | 用途 |
|------|------|
| `useClipboard` | 剪贴板复制 + 自动重置 copied 状态 |
| `useDeleteWithToast` | 通用删除操作（try/catch/toast 封装） |
| `useSavingAction` | 保存操作（saving 状态 + try/catch/toast） |
| `useUpdateCheck` | 自动更新检查（available/progress/downloaded/error 状态机） |

**Queries（TanStack Query hooks）— queryKey 格式 `['domain', 'action', ...params]`：**

| query file | key | IPC 通道 |
|-----------|-----|---------|
| providers.ts | `['providers', 'list']` | `api.providers.*` |
| apiKeys.ts | `['apiKeys', 'list']` | `api.apiKeys.*` |
| conversations.ts | `['conversations', 'list']` | `api.conversations.*` |
| logs.ts | `['logs', 'query', page, limit]` | `api.logs.list()` |
| stats.ts | `['stats', 'get', range]` | `api.logs.stats/statsDetailed()` |
| proxy.ts | `['proxy', 'status']` / `['proxy', 'debugMode']` | `api.proxy.*` |
| update.ts | `['update', 'config']` / `['update', 'currentVersion']` | `api.update.*` |
| modelMappings.ts | `['modelMappings', 'list']` / `['models', 'list']` | `api.models.*` |
| agents.ts | `['agents', 'list']` / `['agents', 'getById', id]` / `['agentConfigs', 'list', agentId]` | `api.agents.*` |

**Markdown 渲染（markdown.tsx）：**
- `react-markdown` + `remark-gfm`（表格） + `rehype-raw`（HTML 标签）
- `rehypeStripColorStyle` — 剥离行内 color/background 样式（适配暗色主题）
- 代码块渲染：
  - 流式传输中：纯文本渲染
  - Mermaid 图表：`MermaidBlock` 组件（图表/代码双视图切换）
  - 已完成代码：`CodeBlock` + `Shiki` 异步语法高亮
- 仅支持 5 种语言高亮：ts/js/python/json/bash

**Mermaid 图表渲染（mermaid.tsx）：**
- **动态导入：** mermaid 库（~4MB）通过 `import('mermaid')` 在 `useEffect` 中按需异步加载
- `serializedRender()` 串行化 `mermaid.render()` 调用，避免并发 DOM 操作冲突
- 三态渲染：loading → ready（SVG） / error（错误提示）

---

### 5.7 更新模块 (src/main/update/)

**manager.ts** — `electron-updater` 封装（179 行）：
- **延迟导入：** `ensureAutoUpdater()` 首次调用时动态 `await import('electron-updater')` 加载 ~976KB 包体
- 事件通过 `webContents.send()` 广播给所有渲染进程窗口
- `checkForUpdates()`：检查更新 → 跳过已忽略版本 → 比较版本号
- `downloadUpdate()` / `installUpdate()` → 委托给 autoUpdater

**config.ts** — 配置持久化（88 行）：
- JSON 文件存储在 `userData/update-config.json`
- 字段：isAutoCheckEnabled / checkInterval / isPrereleaseAllowed / skipVersion

**ipc.ts** — 7 个 IPC handler（46 行）
- `update:check/download/install/getCurrentVersion` — 操作
- `update:skipVersion/getConfig/setConfig` — 配置

---

### 5.8 工具库 (src/renderer/lib/)

**api-client.ts** — 统一 HTTP 封装（仅 Chat SSE 流使用）：
- `setApiKey(key)` — 运行时注入 API Key
- `getApiKey()` — 获取当前 API Key
- `apiFetch(path, init)` — 自动注入 Authorization + Content-Type 头
- `ApiError` 类 — 非 2xx 响应时抛出（含 status + body）

**shiki.ts** — 代码高亮：
- `getHighlighter()` — 懒加载 Shiki highlighter（仅 5 种语言）
- `highlightCode(code, lang)` — 返回 HTML 字符串，失败回退到纯文本

**animations.ts** — framer-motion 动画常量：
- `pageVariants` — 页面入场动画
- `childVariants` — 子元素滑入动画
- `rowFadeIn(idx)` — 表格行交错淡入

**utils.ts** — 工具函数：
- `cn()` — Tailwind 类名合并
- `formatDate()` / `formatRelativeDate()` — 日期格式化
- `getErrorMessage()` — 通用错误消息提取

---

## 六、设计模式和约定

### 6.1 Domain 模式

每个 `src/main/domains/{name}/` 目录遵循三件套：
```
{name}.types.ts    — 类型定义（输入/输出 DTO，camelCase）
{name}.schema.ts   — Zod 输入校验（create/update handler 入口使用）
{name}.service.ts  — 业务逻辑工厂函数 create{Name}Service(_db)
                   └─ 内部委托给 db/*.ts 数据层函数（模式 A）
                   └─ service 层做 snake_case → camelCase 映射
                   └─ 方法: list / getById / create / update / remove
```

### 6.2 IPC 分层

```
Renderer.library function → preload bridge → ipcMain.handle callback
  ↑ 类型安全                    ↑ window.electronAPI    ↑ 调用 service 层
```

### 6.3 TanStack Query 约定

- Query keys 始终使用层级化数组：`['domain', 'action', ...params]`
  - ✅ `['providers', 'list']`、`['agents', 'getById', id]`、`['logs', 'query', page, limit]`
  - ❌ `['providers']`（缺少 action）、`'providers'`（字符串格式）
- 所有 mutations 成功后 `invalidateQueries` 刷新相关查询
- staleTime 30s，禁止 refetchOnWindowFocus，retry 0

### 6.4 安全边界

- API Key 明文存储（本地桌面，无网络暴露）
- SHA256 哈希用于 Key 验证
- Hono 代理仅监听 `127.0.0.1`
- 无加密/解密逻辑
- **API Key 日志脱敏**：`sanitize()` 函数覆盖 `authorization`/`x-api-key`/`token`/`password`/`secret` 五个敏感键名，console 和 file 双 transport 共用脱敏管线
- 模型映射仅存储模型名（不含 API Key），通过 `target_model` 的 `provider/model` 格式路由到对应供应商

### 6.5 目录导入规则（分层架构）

```
入口层（index.ts, update/）→ 可导入全部下层
接口层（ipc/）             → 禁止导入 db/（type-only import 除外），可导入 domains/、core/
接口层（proxy/）           → 禁止导入 db/、domains/，可导入 core/
业务层（domains/）         → 禁止导入 proxy/，可导入 db/、core/、其他 domains/
数据层（db/）              → 禁止导入 domains/、proxy/、ipc/，可导入 core/
基础设施层（core/）         → 禁止导入 domains/、proxy/、ipc/、db/

renderer/lib/              → 可以导入 shared/（类型导入）
renderer/features/*        → 只能导本目录内容，不能跨 feature
renderer/components/ui/    → 禁止导入 features/、pages/、lib/queries/
```

**注**：`ipc/index.ts` 导入 `getDb()` 和 handler 导入 `type Database` 是当前模式 A 下工厂注入的必要路径，属于规则例外（详见 `30-layered-architecture.md`）。

---

## 七、关键数据格式

### 7.1 ModelMapping（模型映射实体）

```typescript
// 数据层 snake_case（ModelMappingRow）
interface ModelMappingRow {
  id: number
  source_model: string      // 客户端请求的模型名，如 "gpt-4o"
  target_model: string      // 完整模型 ID，如 "deepseek/deepseek-v4-pro"
  is_active: number         // 1=启用, 0=禁用
  created_at: string
}

// service 层 camelCase（供 renderer 使用）
interface ModelMapping {
  id: number
  sourceModel: string
  targetModel: string
  isActive: number
  createdAt: string
}
```

### 7.2 ModelInfo（模型信息）

```typescript
interface ModelInfo {
  id: string                // 完整模型 ID，如 "anthropic/claude-sonnet-4"
  provider: string          // provider name
  providerType: string      // 'anthropic' | 'openai'
}
```

### 7.3 AgentEntity（Agent 实体）

```typescript
interface AgentEntity {
  id: number
  name: string              // 唯一标识，如 "claude-code"
  displayName: string       // 显示名称，如 "Claude Code"
  configPath: string        // 配置文件路径
  configFormat: 'json' | 'toml' | 'env'
  isBuiltin: number         // 1=内置, 0=自定义
  createdAt: string
  updatedAt: string
}
```

### 7.4 AgentConfigEntity（Agent 配置版本）

```typescript
interface AgentConfigEntity {
  id: number
  agentId: number           // FK → agents.id
  name: string              // 配置名称
  content: string           // 配置文件内容
  isCurrent: number         // 1=当前使用中, 0=非当前
  createdAt: string
  updatedAt: string
}
```

### 7.5 LogDebugInfo（调试日志格式）

```typescript
interface LogDebugInfo {
  client: { body, apiFormat }
  route: { providerName, providerType, baseUrl, modelName }
  conversion?: { from, to, originalPath, convertedPath, originalModel, convertedModel }
  upstream: { url, body, statusCode, responseBody }
  error?: string
}
```

### 7.6 SSE 格式对照

| 场景 | 格式 |
|------|------|
| OpenAI 标准 SSE | `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` |
| Anthropic 标准 SSE | `event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"..."}}\n\n` |

---

## 八、测试

- **框架：** vitest + jsdom
- **数据库测试：** 使用真实 sql.js 内存库（`:memory:`），不 mock
- **位置：** 与源文件 co-located，`__tests__/xxx.test.ts`
- **覆盖率：** 每个 service.ts 对应 service.test.ts
- **测试文件：** 共 35+ 个测试文件，覆盖 db/domains/proxy/ipc/core/update/renderer 各层
- **测试用例：** 506 个（后端 433 + 前端 73）

**测试文件清单：**

| 层级 | 测试文件 |
|------|---------|
| db/ | connection, providers, api-keys, conversations, logs, schema, agents, agent-configs (8) |
| domains/ | provider.service, provider.schema, apikey.schema, conversation.schema, logs.service, models.service, agent.service, agent.schema, agent.e2e (9) |
| proxy/ | server, middleware, rate-limiter, converter, router, model-mapping, forwarder (7) |
| ipc/ | sse-parser, integration (2) |
| core/ | logger (1) |
| update/ | config, manager (2) |
| renderer/ | markdown, mermaid, Chat, DownloadProgress, UpdateButton, UpdateDialog (6) |

---

*本文档应与 `.claude/rules/` 目录下的规则文件配合阅读。*
