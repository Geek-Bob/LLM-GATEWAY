# LLM Gateway 架构技术手册

> 技术细节手册 — 覆盖完整目录结构、数据流、模块职责和设计约定。
> 编写日期: 2026-05-30 | Electron 42 + TypeScript 6.0 + React 19.2

---

## 一、项目概述

**LLM Gateway** 是一个 Electron 桌面客户端，核心功能：
1. **多 LLM 供应商代理** — 通过本地 HTTP 服务器代理 OpenAI/Anthropic API 请求，支持自动协议转换
2. **聊天界面** — 对话式 AI 交互，支持流式 SSE 和 Mermaid 图表渲染
3. **管理仪表盘** — 供应商管理、API Key 管理、请求日志与统计

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
│   │   ├── domains/                     # 业务逻辑层（domain 模式）
│   │   │   ├── provider/
│   │   │   │   ├── provider.types.ts    # Provider 类型定义
│   │   │   │   └── provider.service.ts  # Provider 业务逻辑
│   │   │   ├── apikey/
│   │   │   │   ├── apikey.types.ts      # API Key 类型定义
│   │   │   │   └── apikey.service.ts    # API Key 业务逻辑（薄封装）
│   │   │   ├── conversation/
│   │   │   │   ├── conversation.types.ts  # 对话/消息类型
│   │   │   │   └── conversation.service.ts # 对话业务逻辑
│   │   │   ├── logs/
│   │   │   │   └── logs.service.ts      # 日志业务逻辑
│   │   │   └── stats/
│   │   │       └── stats.service.ts     # 统计业务逻辑
│   │   ├── proxy/                       # HTTP 代理层（Hono 服务器）
│   │   │   ├── server.ts                # Hono 应用定义（路由/中间件/代理逻辑）
│   │   │   ├── manager.ts               # 代理生命周期管理
│   │   │   ├── router.ts                # 模型ID → 供应商路由解析
│   │   │   ├── forwarder.ts             # 上游 URL/Header 构建
│   │   │   ├── converter.ts             # OpenAI ↔ Anthropic 协议转换
│   │   │   ├── middleware.ts            # Auth 中间件（Bearer token 提取）
│   │   │   └── rate-limiter.ts          # 滑动窗口限流器
│   │   └── update/                      # 自动更新模块
│   │       ├── manager.ts               # electron-updater 封装
│   │       ├── config.ts                # 更新配置持久化
│   │       └── ipc.ts                   # 更新相关 IPC handler
│   │
│   ├── preload/
│   │   └── index.ts                     # contextBridge 暴露 IPC 到渲染进程
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
│   │   │       └── hooks/
│   │   │           └── useChatStream.ts  # 聊天 SSE 流读取 hook
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
| **业务 CRUD** | Provider/API Key/对话/日志 CRUD | IPC | lib/ipc.ts → preload → ipcMain.handle |
| **Chat 流式** | 聊天 SSE 流 | HTTP | api-client.ts → Hono server (8080) → upstream |

### 4.3 Chat 流式数据流（完整链路）

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
  │ resolveProvider(model) → convertRequest()（如需） → fetch(upstream)
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

**schema.ts** — 6 张表：

| 表 | 主键 | 用途 |
|----|------|------|
| `providers` | id | LLM 供应商配置（API Key、模型列表） |
| `api_keys` | id | Gateway API 密钥（SHA256 哈希 + 明文） |
| `request_stats` | (stat_date, stat_hour) | 请求统计汇总 |
| `request_stats_provider` | (stat_date, stat_hour, provider_id, model) | 按供应商/模型统计 |
| `conversations` | id | 对话列表 |
| `messages` | id | 对话消息（外键关联 conversations） |

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

**logs.ts** — NDJSON 日志系统：
- **分片策略：** 每个 NDJSON 文件最多 10,000 行，最多保留 10 个文件
- 文件命名：`logs-0001.ndjson`、`logs-0002.ndjson` ...
- 循环覆盖：超过 10 个文件时删除最旧的
- `createLogEntry(entry)` → 追加一行 NDJSON
- `queryLogs(query)` → 读取所有文件 → 过滤 → 分页
- `getLogStats(range)` → 从 SQLite `request_stats` 表聚合（24h/7d/30d）
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
  2. `resolveProvider(model)` 查找供应商
  3. 协议自动转换（如客户端 OpenAI 格式 → 供应商 Anthropic）
  4. `buildProxyUrl()` + `buildProxyHeaders()` 构建上游请求
  5. 发送请求到 upstream LLM API
  6. SSE 流：对流式响应进行 `tee()` 分流（日志记录 + 客户端发送）
  7. SSE 转换：`convertSSEStream()` 进行协议转换
  8. 非流式：`convertResponse()` 格式转换
  9. 日志记录：`createLogEntry()` / `updateRequestStats()` / `updateProviderStats()`

**router.ts** — 模型路由解析：
- 模型 ID 格式：`{provider-name}/{model-id}`（例如 `openai/gpt-4`）
- `parseModelId()` → 分割前缀和模型名
- `resolveProvider()` → 按名称查找供应商 → 验证活跃状态 → 验证模型在白名单中
- `getAllModels()` → 遍历所有活跃供应商，构建完整模型列表

**forwarder.ts** — 上游请求构建：
- `buildProxyUrl()` → 检测并去重重叠路径（如 `baseUrl` 以 `/v1` 结尾，path 以 `/v1` 开头）
- `buildProxyHeaders()` → 注入 Authorization 请求头，Anthropic 额外添加 `anthropic-version`

**converter.ts** — 协议转换（关键复杂模块）：
- 支持 OpenAI ↔ Anthropic 双向转换（请求、响应、SSE）
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

Domain 模式：每个业务域一个目录，包含 `*.types.ts` 和 `*.service.ts`。

设计原则：
- **service 是纯数据层** — 不操作 Request/Response，只接收/返回 JS 数据
- **每个 domain 只有一个 service**
- **service 注入 Database 实例**（函数式工厂 `createXxxService(db)`）

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
| `conversation:list/create/update/delete/get` | CRUD | `db/conversations.ts` |
| `conversation:messages/addMessage` | CRUD | `db/conversations.ts` |
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
  debug.log(),                    # 调试日志转发
  providers.list/create/update/delete(),
  apiKeys.list/create/delete(),
  logs.query/stats/statsDetailed(),
  conversations.list/create/update/delete/get/messages/addMessage(),
  proxy.status/start/stop/restart/setPort/getDebugMode/setDebugMode(),
  window.minimize/maximize/close(),
  update.check/download/install/skipVersion/getConfig/setConfig/
         getCurrentVersion/
         onAvailable/onProgress/onDownloaded/onError()
}
```

---

### 5.6 渲染进程 (src/renderer/)

**main.tsx** — 入口：
- TanStack QueryClient 初始化（staleTime 30s，无 refetchOnWindowFocus，无 retry）
- Query 错误日志自动订阅

**App.tsx** — 根组件：
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

**Queries（TanStack Query hooks）：**
所有 queries 统一通过 `lib/ipc.ts` 的 `api` 对象调用 IPC，结构：

| query file | key | IPC 通道 |
|-----------|-----|---------|
| providers.ts | `['providers']` | `api.providers.*` |
| apiKeys.ts | `['apiKeys']` | `api.apiKeys.*` |
| conversations.ts | `['conversations']` | `api.conversations.*` |
| logs.ts | `['logs', page, limit]` | `api.logs.query()` |
| stats.ts | `['stats', range]` | `api.logs.stats/statsDetailed()` |
| proxy.ts | `['proxy', 'status']` / `['proxy', 'debugMode']` | `api.proxy.*` |
| update.ts | `['update-config']` / `['current-version']` | `api.update.*` |

**Markdown 渲染（markdown.tsx）：**
- `react-markdown` + `remark-gfm`（表格） + `rehype-raw`（HTML 标签）
- `rehypeStripColorStyle` — 剥离行内 color/background 样式（适配暗色主题）
- 代码块渲染：
  - 流式传输中：纯文本渲染
  - Mermaid 图表：`MermaidBlock` 组件（图表/代码双视图切换）
  - 已完成代码：`CodeBlock` + `Shiki` 异步语法高亮
- 仅支持 5 种语言高亮：ts/js/python/json/bash

**Mermaid 图表渲染（mermaid.tsx）：**
- `serializedRender()` 串行化 `mermaid.render()` 调用，避免并发 DOM 操作冲突
- 三态渲染：loading → ready（SVG） / error（错误提示）
- 使用独立 div 引用（svgRef），避免 innerHTML 替换 React 子节点导致协调冲突

---

### 5.7 更新模块 (src/main/update/)

**manager.ts** — `electron-updater` 封装：
- `setupAutoUpdater()`：注册 update-available/download-progress/update-downloaded/error 事件
- 事件通过 `webContents.send()` 广播给所有渲染进程窗口
- `checkForUpdates()`：检查更新 → 跳过已忽略版本 → 比较版本号
- `downloadUpdate()` / `installUpdate()` → 委托给 autoUpdater

**config.ts** — 配置持久化：
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

每个 `src/main/domains/{name}/` 目录遵循：
```
{name}.types.ts    — 类型定义（输入/输出 DTO）
{name}.service.ts  — 业务逻辑工厂函数 create{Name}Service(db)
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

### 6.5 目录导入规则

```
main/domains/* → 可以导入 core/ 和 db/（业务层向下依赖工具层）
main/ipc/      → 可以导入 db/（IPC handler 直接调 CRUD 函数）
main/proxy/    → 可以导入 db/（日志记录）
renderer/lib/  → 可以导入 shared/
renderer/features/* → 只能导本目录内容，不能跨 feature
core/          → 不能导入 domains/（下层不能依赖上层）
proxy/         → 不能导入 domains/（工具层不含业务逻辑）
```

---

## 七、关键数据格式


### 7.2 LogDebugInfo（调试日志格式）

```typescript
interface LogDebugInfo {
  client: { body, apiFormat }
  route: { providerName, providerType, baseUrl, modelName }
  conversion?: { from, to, originalPath, convertedPath, originalModel, convertedModel }
  upstream: { url, body, statusCode, responseBody }
}
```

### 7.3 SSE 格式对照

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

---

*本文档应与 `.claude/rules/` 目录下的规则文件配合阅读。*
