# LLM Gateway 架构技术手册

> 技术细节手册 — 覆盖完整目录结构、数据流、模块职责和设计约定。
> 编写日期: 2026-05-30 | 最后更新: 2026-06-05 | Electron 42 + TypeScript 6.0 + React 19.2

---

## 一、项目概述

**LLM Gateway** 是一个 Electron 桌面客户端，核心功能：
1. **多 LLM 供应商代理** — 通过本地 HTTP 服务器代理 OpenAI/Anthropic API 请求，支持自动协议转换
2. **聊天界面** — 对话式 AI 交互，支持流式 SSE 和 Mermaid 图表渲染
3. **管理仪表盘** — 供应商管理、API Key 管理、请求日志与统计
4. **模型映射** — 将客户端请求的模型名（如 `gpt-4o`）映射到实际供应商模型（如 `deepseek/deepseek-v4-pro`），支持 Agent 工具能力释放

---

## 二、技术栈

| 技术 | 用途 | 版本 | 备注 |
|------|------|------|------|
| Electron | 桌面壳 | 42 | 无 frame，自定义 TitleBar |
| TypeScript | 语言 | 6.0 | 禁用 `enum`/`namespace`/装饰器 |
| React | UI | 19.2 | 仅函数组件，无 class 组件 |
| Tailwind CSS | 样式 | 4.3 | 禁用 config 文件 |
| Hono | HTTP 框架 | 4.x | 仅用于 proxy 服务器 |
| TanStack Query | 数据请求 | 5.x | 数组 queryKey，禁用字符串 |
| sql.js | 嵌入式数据库 | 最新 | WebAssembly SQLite |
| Shiki | 代码高亮 | 最新 | 替代 highlight.js |
| Vite | 构建 | 6.4 | electron-vite 集成 |
| Framer Motion | 动画 | 最新 | 页面/列表过渡动画 |
| Recharts | 图表 | 最新 | 统计柱状图/面积图 |
| react-markdown | Markdown | 最新 | GFM + 代码高亮 |
| Mermaid | 图表渲染 | 最新 | 支持流程图/时序图 |

---

## 三、目录结构（完整）

```
e:\code\llm-gateway\
├── src/
│   ├── main/                            # Electron 主进程
│   │   ├── index.ts                     # 入口：窗口/Tray/启动
│   │   ├── core/
│   │   │   └── logger.ts                # 统一日志接口（替换 console.log）
│   │   ├── ipc/
│   │   │   ├── index.ts                 # IPC handler 注册（全部业务 CRUD）
│   │   │   └── sse-parser.ts            # SSE 解析工具函数
│   │   ├── db/                          # 数据库层（sql.js）
│   │   │   ├── connection.ts            # 连接管理（单例模式）
│   │   │   ├── database.ts              # sql.js 封装（Statement/Database 类）
│   │   │   ├── schema.ts                # 建表 DDL
│   │   │   ├── providers.ts             # Provider CRUD 函数
│   │   │   ├── api-keys.ts              # API Key CRUD + 生成/校验
│   │   │   ├── conversations.ts         # 对话/消息 CRUD
│   │   │   └── logs.ts                  # NDJSON 日志写入/查询/统计
│   │   ├── domains/                     # 业务逻辑层（domain 模式，无 router）
│   │   │   ├── provider/
│   │   │   │   ├── provider.types.ts    # Provider 类型定义
│   │   │   │   ├── provider.schema.ts   # Provider Zod 校验
│   │   │   │   └── provider.service.ts  # Provider 业务逻辑
│   │   │   ├── apikey/
│   │   │   │   ├── apikey.types.ts      # API Key 类型定义
│   │   │   │   ├── apikey.schema.ts     # API Key Zod 校验
│   │   │   │   └── apikey.service.ts    # API Key 业务逻辑（薄封装）
│   │   │   ├── conversation/
│   │   │   │   ├── conversation.types.ts  # 对话/消息类型
│   │   │   │   ├── conversation.schema.ts # 对话 Zod 校验
│   │   │   │   └── conversation.service.ts # 对话业务逻辑
│   │   │   ├── models/
│   │   │   │   ├── models.types.ts      # 模型映射类型（ModelMapping、ModelInfo）
│   │   │   │   ├── models.schema.ts     # 模型映射 Zod 校验
│   │   │   │   └── models.service.ts    # 模型列表 + 映射 CRUD（模式 B：无状态）
│   │   │   ├── logs/
│   │   │   │   └── logs.service.ts      # 日志业务逻辑
│   │   │   └── stats/
│   │   │       └── stats.service.ts     # 统计业务逻辑
│   │   ├── proxy/                       # HTTP 代理层（Hono 服务器）
│   │   │   ├── server.ts                # Hono 应用定义（路由/中间件/代理逻辑）
│   │   │   ├── manager.ts               # 代理生命周期管理
│   │   │   ├── router.ts                # 模型ID → 供应商路由解析
│   │   │   ├── forwarder.ts             # 上游 URL/Header 构建
│   │   │   ├── converter/               # OpenAI ↔ Anthropic 协议转换（5 文件拆分）
│   │   │   │   ├── types.ts             # StreamContext、ProtocolFormat 共享类型
│   │   │   │   ├── request.ts           # convertRequest() 双向请求转换
│   │   │   │   ├── response.ts          # convertResponse() 非流式响应转换
│   │   │   │   ├── sse.ts               # convertSSEEvent() + SSE 状态机
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
│   │   ├── pages/                       # 页面组件
│   │   │   ├── Chat.tsx                 # 聊天页（核心功能）
│   │   │   ├── Dashboard.tsx            # 仪表盘概览
│   │   │   ├── Providers.tsx            # 供应商管理 CRUD
│   │   │   ├── ApiKeys.tsx              # API Key 管理 CRUD
│   │   │   ├── Logs.tsx                 # 请求日志查看
│   │   │   ├── ModelMappings.tsx        # 模型映射 CRUD 管理
│   │   │   └── Settings.tsx             # 应用设置
│   │   ├── components/                  # 共享 UI 组件
│   │   │   ├── Layout.tsx               # 应用布局（侧边栏导航 + TitleBar）
│   │   │   ├── TitleBar.tsx             # 自定义窗口标题栏
│   │   │   ├── ChatMessage.tsx          # 聊天气泡组件
│   │   │   ├── ChatInput.tsx            # 聊天输入框
│   │   │   ├── ConversationSidebar.tsx  # 会话历史侧边栏
│   │   │   ├── StatsCard.tsx            # 统计卡片
│   │   │   ├── StatsCharts.tsx          # 柱状图/面积图
│   │   │   ├── StatusBar.tsx            # 代理状态指示
│   │   │   ├── ErrorBoundary.tsx        # React 错误边界
│   │   │   ├── ui/                      # shadcn/ui 风格基础组件
│   │   │   │   ├── button.tsx, dialog.tsx, input.tsx, ...
│   │   │   │   ├── markdown.tsx         # Markdown 渲染（Shiki 高亮 + Mermaid）
│   │   │   │   └── mermaid.tsx          # Mermaid 图表渲染组件
│   │   │   └── update/                  # 更新 UI 组件
│   │   ├── features/
│   │   │   └── chat/
│   │   │       ├── components/
│   │   │       │   └── ChatToolbar.tsx   # Provider/Model/API Key 选择器
│   │   │       └── hooks/
│   │   │           ├── useChatStream.ts  # 聊天 SSE 流读取 hook
│   │   │           └── useConversationManager.ts # 会话 CRUD 逻辑 hook
│   │   ├── shared/
│   │   │   └── lib/
│   │   │       ├── api-client.ts        # HTTP 统一封装（仅 Chat 使用）
│   │   │       └── shiki.ts             # Shiki 代码高亮辅助
│   │   └── lib/
│   │       ├── ipc.ts                   # window.electronAPI 快捷导出
│   │       ├── types.ts                 # 类型定义 + Window 全局声明
│   │       ├── utils.ts                 # cn() 工具函数
│   │       └── queries/                 # TanStack Query hooks
│   │           ├── providers.ts         # 供应商 queries
│   │           ├── apiKeys.ts           # API Key queries
│   │           ├── conversations.ts     # 对话 queries
│   │           ├── logs.ts              # 日志 queries
│   │           ├── stats.ts             # 统计 queries
│   │           ├── proxy.ts             # 代理状态 queries
│   │           └── update.ts            # 更新 queries
│   │
│   └── shared/                          # 主/渲染进程共享类型
│       └── types.ts                     # LogDebugInfo / UpdateInfo / ...
│
├── .claude/rules/                       # Claude Code 规则模块
│   ├── 00-core.md                       # 全局禁止/必须项
│   ├── 10-tech-stack.md                 # 技术版本红线
│   ├── 20-directory.md                  # 目录边界
│   ├── 30-main.md                       # 主进程 domain 模板
│   ├── 31-renderer.md                   # 渲染进程 feature 模板
│   ├── 40-api.md                        # API 设计规范
│   ├── 50-testing.md                    # 测试约定
│   └── 60-security.md                   # 安全边界
│
└── docs/
    ├── ARCHITECTURE.md                  # 本文档
    └── superpowers/                     # 设计文档/计划（SDD/TDD）
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
│  │  lib/ipc.ts (window.electronAPI)         shared/lib/        │  │
│  │  IPC 通信通道                             api-client.ts     │  │
│  │  (预加载桥接)                              HTTP 直连 Hono    │  │
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
| **业务 CRUD** | Provider/API Key/对话/日志/模型映射 CRUD | IPC | lib/ipc.ts → preload → ipcMain.handle |
| **Chat 流式** | 聊天 SSE 流 | HTTP | api-client.ts → Hono server (8080) → upstream |

### 4.3 模型映射数据流

```
客户端请求 model="gpt-4o"
  │
  ▼
handleProxyRequest()
  │ modelsService.findModelMapping("gpt-4o")
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
handleProxyRequest()
  │ findModelMapping(model) → resolveProvider(resolvedModel) → convertRequest()（如需） → fetch(upstream)
  ▼
上游 LLM API（OpenAI / Anthropic）
  │ SSE 流响应
  ▼
handleProxyRequest() — convertSSEEvent()（如需） → SSE 透传
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

---

## 五、各层详解

### 5.1 数据库层 (src/main/db/)

**技术选择：** sql.js（WebAssembly SQLite），无独立进程，与 Electron 主进程同进程运行。

**database.ts** — 核心封装：
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

**schema.ts** — 7 张表：

| 表 | 主键 | 用途 |
|----|------|------|
| `providers` | id | LLM 供应商配置（API Key、模型列表） |
| `model_mappings` | id | 模型名称映射（source_model → target_model，UNIQUE 约束） |
| `api_keys` | id | Gateway API 密钥（SHA256 哈希 + 明文） |
| `request_stats` | (stat_date, stat_hour) | 请求统计汇总 |
| `request_stats_provider` | (stat_date, stat_hour, provider_id, model) | 按供应商/模型统计 |
| `conversations` | id | 对话列表 |
| `messages` | id | 对话消息（外键关联 conversations） |

**model_mappings 表** — 模型名称映射：
- `source_model` — 客户端请求的模型名（UNIQUE 约束，如 `gpt-4o`、`claude-sonnet-4`）
- `target_model` — 实际映射的完整模型 ID（如 `deepseek/deepseek-v4-pro`）
- `is_active` — 启用/禁用状态（1/0）
- 代理请求时按 `source_model` 精确匹配，命中则替换为 `target_model` 后走正常路由

**providers.ts** — 供应商 CRUD 函数：
- `createProvider(input)` → 插入新供应商，返回 ID
- `getProvider(id) / getProviderByName(name)` → 按 ID 或名称查询
- `listProviders() / listActiveProviders()` → 全量/仅活跃
- `updateProvider(id, updates)` → 动态列映射更新（camelCase → snake_case）
- `deleteProvider(id)` → 按 ID 删除
- 使用 `JSON.stringify` 存储 models 数组，`rowToProvider` 中 `JSON.parse` 恢复

**api-keys.ts** — API Key 管理函数：
- `generateApiKey()` → 生成 `sk-` 前缀 + 36 字节 base64url 随机字符串
- `hashKey()` → SHA256 哈希
- `createApiKey(name, rateLimit)` → 插入新 key，返回明文 + 公钥信息
- `verifyApiKey(plaintextKey)` → 验证 key 有效性（哈希匹配 + is_active）
- `listApiKeys()` → 列出所有 key（含明文）
- `deleteApiKey(id)` → 按 ID 删除

**conversations.ts** — 对话/消息 CRUD 函数：
- `listConversations()` → 按 updated_at 降序
- `createConversation(title, model, providerId, apiKeyId)` → 插入新对话
- `updateConversation(id, data)` → 动态字段更新
- `getConversation(id)` → 查询单条
- `deleteConversation(id)` → 按 ID 删除（CASCADE 删除关联消息）
- `listMessages(conversationId)` → 查询对话下所有消息
- `addMessage(conversationId, role, content, thinking)` → 添加消息 + 更新对话时间

**migrate-db.mjs** — 数据库迁移脚本：
- 处理列重命名：`providers.api_key_encrypted → api_key`、`api_keys.key_encrypted → key`
- 处理 `model_mappings` 表迁移：旧版有 `provider_type` 字段时自动删除（新版通过 `target_model` 的 `provider/model` 格式隐含供应商信息）
- 流程：备份旧库 → 读取旧数据 → 按当前 schema 创建新库 → 映射列名写入 → 替换旧文件
- UNIQUE 约束冲突自动跳过（同一 `source_model` 多条记录只保留第一条）

**logs.ts** — NDJSON 日志系统：
- **分片策略：** 每个 NDJSON 文件最多 10,000 行，最多保留 10 个文件
- 文件命名：`logs-0001.ndjson`、`logs-0002.ndjson` ...
- 循环覆盖：超过 10 个文件时删除最旧的
- **元数据持久化（logs-meta.json）：** `entryCounter`、`currentFileNumber`、`currentFileLines` 三个计数器通过 `loadMeta()` / `saveMeta()` 持久化到 `logs-meta.json`（~100 字节 JSON），避免启动时全量扫描 NDJSON 文件恢复状态。兼容旧版本：元数据文件缺失时回退到全量扫描一次 → 立即写入元数据
- `createLogEntry(entry)` → 追加一行 NDJSON → 调用 `saveMeta()` 持久化计数器
- `queryLogs(query)` → 读取所有文件 → 过滤 → 分页
- `getLogStats(range)` → 从 SQLite `request_stats` 表聚合（24h/7d/30d），不依赖 NDJSON 扫描
- `getDetailedStats(range)` → 按供应商/模型分组统计
- `normalizeEntry()` 处理新旧字段名兼容

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

**server.ts**（核心逻辑）：
- `handleProxyRequest()` 处理完整代理流程：
  1. 解析客户端请求体、模型
  2. **模型映射**：`findModelMapping(model)` 查找活跃映射，有则替换为 `targetModel`，无则透传原始模型名
  3. `resolveProvider(resolvedModel)` 查找供应商
  4. 协议自动转换（如客户端 OpenAI 格式 → 供应商 Anthropic）
  5. `buildProxyUrl()` + `buildProxyHeaders()` 构建上游请求
  6. 发送请求到 upstream LLM API
  7. SSE 流：对流式响应进行 `tee()` 分流（日志记录 + 客户端发送）
  8. SSE 转换：`convertSSEStream()` 进行协议转换
  9. 非流式：`convertResponse()` 格式转换
  10. 日志记录：`createLogEntry()` / `updateRequestStats()` / `updateProviderStats()`

**router.ts** — 模型路由解析：
- 模型 ID 格式：`{provider-name}/{model-id}`（例如 `openai/gpt-4`）
- `parseModelId()` → 分割前缀和模型名
- `resolveProvider()` → 按名称查找供应商 → 验证活跃状态 → 验证模型在白名单中
- 注意：`getAllModels()` 已迁移至 `domains/models/models.service.ts`，由 `modelsService.getAllModels()` 提供

**forwarder.ts** — 上游请求构建：
- `buildProxyUrl()` → 检测并去重重叠路径（如 `baseUrl` 以 `/v1` 结尾，path 以 `/v1` 开头）
- `buildProxyHeaders()` → 注入 Authorization 请求头，Anthropic 额外添加 `anthropic-version`

**converter/ 目录** — 协议转换（关键复杂模块，拆分为 5 文件）：
- `types.ts` — StreamContext、ProtocolFormat 等共享类型
- `request.ts` — `convertRequest()` 双向请求转换（OpenAI ↔ Anthropic 请求体）
- `response.ts` — `convertResponse()` 非流式响应转换
- `sse.ts` — `convertSSEEvent()`、`createStreamContext()`、双方向 SSE 状态机
- `index.ts` — barrel export，保持向前兼容

支持 OpenAI ↔ Anthropic 双向转换（请求、响应、SSE）：
- **请求体转换：** `convertRequest(body, from, to)`
  - OpenAI → Anthropic：系统消息提取、角色交替合并、tools → tool_use、response_format → tools
  - Anthropic → OpenAI：system 块提取、thinking → reasoning_content、tool_use → tool_calls
- **响应体转换：** `convertResponse(body, from, to)`
- **SSE 流转换：**
  - `anthropicSSEToOpenAI()`：message_start → 角色 delta、content_block_start/delta → content/reasoning delta
  - `openAISSEToAnthropic()`：带状态跟踪的复杂转换（维护 `StreamContext.state`）
    - 追踪当前打开的 content block 类型（text/thinking/tools）
    - 自动插入 content_block_start/stop 事件
    - 处理 finish_reason + usage 的时序问题

**rate-limiter.ts** — 滑动窗口限流器：
- 内存 Map 存储每个 key 的时间戳数组
- `check(key, limit)` → 清理过期戳 → 比较上限 → 返回 { allowed, remaining, resetAt }
- 超限时自动调度删除 key 的清理

**middleware.ts** — 简单的 auth 提取：
- `authMiddleware(authHeader)` → 从 Bearer token 提取纯 token 字符串

---

### 5.3 业务域层 (src/main/domains/)

Domain 模式：每个业务域一个目录，包含 `*.types.ts`、`*.service.ts`、`*.schema.ts`（可选，Zod 校验）。

**IPC → service → db 三层已激活**：`ipc/index.ts` 全部 handler 委托到 domain service，不再直调 `db/` 函数。

设计原则：
- **service 是业务逻辑层** — 封装数据转换和聚合，不操作 Request/Response
- **每个 domain 只有一个 service**
- **service 注入 Database 实例**（函数式工厂 `createXxxService(db)`，无状态 service 不需要 db）
- **schema 在 IPC 入口验证输入** — Zod `.parse()` 拦截非法数据，保护 service 层

**models domain：**
- `models.service.ts` — 模式 B（无状态 service，内部通过模块级 import 访问 db）
- `getAllModels()` — 聚合所有活跃 provider 的模型列表，从 `proxy/router.ts` 迁移而来
- `findModelMapping(sourceModel)` — 按 sourceModel 精确匹配活跃映射，供 proxy 请求转换时调用
- `listModelMappings/createModelMapping/updateModelMapping/deleteModelMapping` — model_mappings 表 CRUD
- `models.schema.ts` — Zod 校验：`createModelMappingSchema`（sourceModel + targetModel 必填）、`updateModelMappingSchema`（所有字段可选）
- `models.types.ts` — `ModelMapping`（映射实体）、`ModelInfo`（模型信息，id 格式为 `providerName/modelName`）

**provider domain：**
- `provider.service.ts` 封装对 `db/providers.ts` 的调用，转为 Domain 类型
- `list/getById/create/update/remove` 标准 5 个方法

**apikey domain：**
- `apikey.service.ts` 薄封装 `db/api-keys.ts`
- `list/getById/create/remove` 4 个方法
- 简化版：不包含 key_hash 等内部细节

**conversation domain：**
- `conversation.service.ts` 直接操作数据库（不再通过 `db/conversations.ts`）
- `list/getById/create/update/remove/messages/addMessage` 7 个方法

**logs domain：**
- `logs.service.ts` 封装 `db/logs.ts` 函数
- `query/stats/detailedStats` 3 个方法
- `detailedStats` 内部实现按供应商/模型分组的聚合逻辑

**stats domain：**
- `stats.service.ts` 薄封装 `getLogStats()`，仅暴露 `summary` 方法


---

### 5.4 IPC 层 (src/main/ipc/)

**ipc/index.ts** — 全部业务 CRUD 的 `ipcMain.handle` 注册：

| 通道 | 方法 | 对应 db 函数 |
|------|------|-------------|
| `provider:list` | GET | `listProviders()` |
| `provider:create` | POST | `createProvider()` |
| `provider:update` | PUT | `updateProvider()` |
| `provider:delete` | DELETE | `deleteProvider()` |
| `apikey:list` | GET | `listApiKeys()` |
| `apikey:create` | POST | `createApiKey()` |
| `apikey:delete` | DELETE | `deleteApiKey()` |
| `logs:query` | GET | `queryLogs()` |
| `logs:stats` | GET | `getLogStats()` |
| `logs:statsDetailed` | GET | `getDetailedStats()` + 分组聚合 |
| `window:minimize/maximize/close` | 事件 | BrowserWindow 操作 |
| `proxy:status/start/stop/restart/setPort` | CRUD | `proxy/manager.ts` |
| `proxy:getDebugMode/setDebugMode` | CRUD | `proxy/manager.ts` |
| `renderer:log` | 事件 | 渲染进程日志转发 |
| `conversation:list/create/update/delete/get` | CRUD | `conversation.service` |
| `conversation:messages/addMessage` | CRUD | `conversation.service` |
| `models:list` | GET | `modelsService.getAllModels()` |
| `models:mapping:find` | GET | `modelsService.findModelMapping()` |
| `models:mapping:list` | GET | `modelsService.listModelMappings()` |
| `models:mapping:create` | POST | `modelsService.createModelMapping()` + Zod 校验 |
| `models:mapping:update` | PUT | `modelsService.updateModelMapping()` + Zod 校验 |
| `models:mapping:delete` | DELETE | `modelsService.deleteModelMapping()` |
| `update:*` | CRUD | `update/manager.ts` |

**sse-parser.ts** — SSE 解析工具：
- `parseSSELine()` 解析单行 SSE 文本
- `tryExtractText()` 从 Anthropic SSE 对象提取 text/thinking
- `extractFromAnthropicSSE()` / `extractFromOpenaiSSE()` 解析 JSON 行
- `parseAnthropicSSE()` / `parseOpenaiSSE()` 解析完整 SSE 文本

---

### 5.5 预加载层 (src/preload/)

**index.ts** 通过 `contextBridge.exposeInMainWorld` 暴露 `window.electronAPI`：

```
electronAPI = {
  backend.onReady(),              # 监听后端就绪事件（启动 loading 门控）
  debug.log(),                    # 调试日志转发
  providers.list/create/update/delete(),
  apiKeys.list/create/delete(),
  logs.query/stats/statsDetailed(),
  conversations.list/create/update/delete/get/messages/addMessage(),
  proxy.status/start/stop/restart/setPort/getDebugMode/setDebugMode(),
  window.minimize/maximize/close(),
  update.check/download/install/skipVersion/getConfig/setConfig/
         getCurrentVersion/
         onAvailable/onProgress/onDownloaded/onError(),
  models.list(),                  # 获取所有活跃 provider 的模型列表
  models.mapping.find/list/create/update/delete(),  # 模型映射 CRUD
}
```

---

### 5.6 渲染进程 (src/renderer/)

**main.tsx** — 入口：
- TanStack QueryClient 初始化（staleTime 30s，无 refetchOnWindowFocus，无 retry）
- Query 错误日志自动订阅

**App.tsx** — 根组件：
- **启动门控：** 通过 IPC 监听主进程 `backend:ready` 事件，后端未就绪时显示 "正在初始化服务..." loading 界面，避免窗口出现后白屏等待
- **路由级代码分割：** 7 个页面组件（Dashboard/Providers/ApiKeys/Logs/Chat/ModelMappings/Settings）使用 `React.lazy(() => import(...))` 动态加载，`Suspense` 包裹路由出口提供轻量 fallback。主 bundle 从 ~4.4MB 降至 ~2.3MB
- HashRouter + Routes 路由配置
- 更新事件监听（available/progress/downloaded/error）
- UpdateDialog 自动弹出

**Pages：**

| 页面 | 路由 | 主要功能 |
|------|------|---------|
| Dashboard | `/` | 代理开关/端口、4 个统计卡片、调用统计表、30 天趋势图 |
| Providers | `/providers` | CRUD 表格、API Key 查看/复制、模型列表管理 |
| ApiKeys | `/api-keys` | 两步创建（表单→展示明文）、删除确认 |
| Logs | `/logs` | 分页表格、Debug 模式切换、展开详情面板（请求/响应体） |
| Chat | `/chat` | 会话列表、供应商/模型/API Key 选择、消息流式渲染 |
| ModelMappings | `/model-mappings` | 模型名称映射 CRUD、请求模型→映射模型下拉选择、状态切换 |
| Settings | `/settings` | 自动更新开关、预发布版本开关、版本信息 |

**UI 组件：**
- `Layout.tsx` — 侧边栏导航（macOS 26 风格自动收起）+ TitleBar
- `TitleBar.tsx` — 自定义标题栏（无框窗口）
- `ChatMessage.tsx` — 气泡组件（思考过程折叠/展开 + Markdown 渲染 + 复制/重新生成）
- `ChatInput.tsx` — 自动聚焦、高度自适应、Enter 发送
- `ConversationSidebar.tsx` — 会话列表 + 新建/搜索/删除
- `StatsCard.tsx` / `StatsCharts.tsx` — 仪表盘统计卡片 + 柱状图/面积图
- `StatusBar.tsx` — 代理运行状态 + URL 复制
- `ErrorBoundary.tsx` — 渲染异常捕获
- `ModelMappings.tsx` — 模型映射管理页面（表格 + 新增/编辑 Dialog + 下拉选择模型）

**Queries（TanStack Query hooks）：**
所有 queries 统一通过 `lib/ipc.ts` 的 `api` 对象调用 IPC，结构：

> 注意：ModelMappings 页面的 queries 内联在页面组件中（`useQuery` + `api.models.*`），未抽取到 `lib/queries/` 目录。

| query file | key | IPC 通道 |
|-----------|-----|---------|
| providers.ts | `['providers']` | `api.providers.*` |
| apiKeys.ts | `['apiKeys']` | `api.apiKeys.*` |
| conversations.ts | `['conversations']` | `api.conversations.*` |
| logs.ts | `['logs', page, limit]` | `api.logs.query()` |
| stats.ts | `['stats', range]` | `api.logs.stats/statsDetailed()` |
| proxy.ts | `['proxy', 'status']` / `['proxy', 'debugMode']` | `api.proxy.*` |
| update.ts | `['update-config']` / `['current-version']` | `api.update.*` |
| models.ts（ModelMappings 页面内联） | `['models']` / `['model-mappings']` | `api.models.*` |

**Markdown 渲染（markdown.tsx）：**
- `react-markdown` + `remark-gfm`（表格） + `rehype-raw`（HTML 标签）
- `rehypeStripColorStyle` — 剥离行内 color/background 样式（适配暗色主题）
- 代码块渲染：
  - 流式传输中：纯文本渲染
  - Mermaid 图表：`MermaidBlock` 组件（图表/代码双视图切换）
  - 已完成代码：`CodeBlock` + `Shiki` 异步语法高亮
- 仅支持 5 种语言高亮：ts/js/python/json/bash

**Mermaid 图表渲染（mermaid.tsx）：**
- **动态导入：** mermaid 库（~4MB）通过 `import('mermaid')` 在 `useEffect` 中按需异步加载，不阻塞主 bundle 首屏加载。Vite 自动拆分为独立 chunk
- `serializedRender()` 串行化 `mermaid.render()` 调用，避免并发 DOM 操作冲突
- 三态渲染：loading → ready（SVG） / error（错误提示）
- 使用独立 div 引用（svgRef），避免 innerHTML 替换 React 子节点导致协调冲突

---

### 5.7 更新模块 (src/main/update/)

**manager.ts** — `electron-updater` 封装：
- **延迟导入：** 使用 `import type { UpdateInfo }`（编译擦除，零运行时成本）+ `ensureAutoUpdater()` 首次调用时动态 `await import('electron-updater')` 加载 ~976KB 包体，避免主进程模块解析阶段阻塞
- `ensureAutoUpdater()`：首次调用时动态导入 → 注册 update-available/download-progress/update-downloaded/error 事件 → 返回缓存实例
- 事件通过 `webContents.send()` 广播给所有渲染进程窗口
- `checkForUpdates()`：检查更新 → 跳过已忽略版本 → 比较版本号
- `downloadUpdate()` / `installUpdate()` → 委托给 autoUpdater

**config.ts** — 配置持久化（懒加载）：
- **构造函数延迟读取：** 构造函数只记录 `configPath`，`this.config` 初始化为 `null`，`loadConfig()` 首次调用时才从磁盘读取 `update-config.json`，后续命中缓存
- JSON 文件存储在 `userData/update-config.json`
- 字段：autoCheck / checkInterval / allowPrerelease / skipVersion

**ipc.ts** — 6 个 IPC handler
- `update:check/download/install/getCurrentVersion` — 操作
- `update:skip-version/get-config/set-config` — 配置

---

### 5.8 共享库 (src/renderer/shared/lib/)

**api-client.ts** — 统一 HTTP 封装：
- `setApiBaseUrl()` / `setApiKey()` — 运行时配置
- `apiFetch(path, init)` — 自动注入 Authorization + Content-Type 头
- `ApiError` 类 — 非 2xx 响应时抛出（含 status + body）

**shiki.ts** — 代码高亮：
- `getHighlighter()` — 懒加载 Shiki highlighter（仅 5 种语言）
- `highlightCode(code, lang)` — 返回 HTML 字符串，失败回退到纯文本

---

## 六、设计模式和约定

### 6.1 Domain 模式

每个 `src/main/domains/{name}/` 目录遵循（已移除 router.ts，IPC handler 直接注册在 `ipc/index.ts`，增加了 Zod schema 文件）：
```
{name}.types.ts    — 类型定义（输入/输出 DTO）
{name}.service.ts  — 业务逻辑工厂函数 create{Name}Service(db)
{name}.schema.ts   — Zod 输入校验（可选，create/update handler 入口使用）
                   └─ 方法: list / getById / create / update / remove
```

### 6.2 IPC 分层

```
Renderer.library function → preload bridge → ipcMain.handle callback
  ↑ 类型安全                    ↑ window.electronAPI    ↑ 调用 db 层
```

### 6.3 TanStack Query 约定

- Query keys 始终使用数组：`['providers']`、`['logs', page, limit]`
- 所有 mutations 成功后 `invalidateQueries` 刷新相关查询
- staleTime 30s，禁止 refetchOnWindowFocus，retry 0

### 6.4 安全边界

- API Key 明文存储（本地桌面，无网络暴露）
- SHA256 哈希用于 Key 验证
- Hono 代理仅监听 `127.0.0.1`
- 无加密/解密逻辑（已删除）
- API Key 不写入日志文件
- 模型映射仅存储模型名（不含 API Key），通过 `target_model` 的 `provider/model` 格式路由到对应供应商

### 6.5 目录导入规则

```
main/domains/* → 可以导入 core/ 和 db/（业务层向下依赖工具层）
main/ipc/      → 可以导入 domains/（IPC handler 委托到 domain service）
main/proxy/    → 可以导入 db/（日志记录）+ domains/models/（模型映射查询）
renderer/lib/  → 可以导入 shared/ + main/domains/*/types.ts（类型导入）
renderer/features/* → 只能导本目录内容，不能跨 feature
core/          → 不能导入 domains/（下层不能依赖上层）
proxy/         → 不能导入 domains/（除 models.service 外，工具层不含业务逻辑）
```

---

## 七、关键数据格式

### 7.1 ModelMapping（模型映射实体）

```typescript
interface ModelMapping {
  id: number
  sourceModel: string       // 客户端请求的模型名，如 "gpt-4o"
  targetModel: string       // 完整模型 ID，如 "deepseek/deepseek-v4-pro"
  isActive: number          // 1=启用, 0=禁用
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

### 7.3 LogDebugInfo（调试日志格式）

```typescript
interface LogDebugInfo {
  client: { body, apiFormat }
  route: { providerName, providerType, baseUrl, modelName }
  conversion?: { from, to, originalPath, convertedPath, originalModel, convertedModel }
  upstream: { url, body, statusCode, responseBody }
}
```

### 7.4 SSE 格式对照

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
- **SSE 测试工具：** `sse-parser.ts` 提供 `parseAnthropicSSE()` / `parseOpenaiSSE()` 辅助验证
- **模型映射测试：** `proxy/__tests__/model-mapping.test.ts` — 端到端集成测试（UNIQUE 约束、CRUD 生命周期）

---

*本文档应与 `.claude/rules/` 目录下的规则文件配合阅读。*
