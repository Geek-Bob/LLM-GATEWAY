# 技术架构

本文档描述 LLM Gateway 的内部架构、模块分层和设计模式，帮助开发者阅读和贡献代码。

---

## 整体分层

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (React 19)                                    │
│  pages/     → Dashboard, Providers, ApiKeys, Logs, Chat         │
│  queries/   → TanStack Query hooks (每个数据域一个文件)           │
│  components/→ Layout 壳 + shadcn/ui 原语 + 业务组件              │
├──────────────────── contextBridge (IPC) ────────────────────────┤
│  Preload (src/preload/)                                         │
│  window.electronAPI.* → ipcRenderer.invoke / send               │
├─────────────────────────────────────────────────────────────────┤
│  Main Process (src/main/)                                       │
│  ┌───────────┐  ┌────────────┐  ┌────────────────────────────┐  │
│  │ db/       │  │ ipc/       │  │ proxy/                     │  │
│  │ sql.js    │  │ handlers   │  │ Hono server (代理核心)      │  │
│  │ + NDJSON  │  │            │  │ server→router→converter    │  │
│  └───────────┘  └────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**这不是传统前后端分离。** Main 和 Renderer 通过 Electron IPC 通信（`ipcRenderer.invoke` / `ipcMain.handle`），而非 HTTP REST API。Hono 代理服务器是给外部 LLM 客户端用的，不给渲染进程用。

---

## 目录结构

```
src/
  shared/
    types.ts                   ← LogDebugInfo（主进程和渲染进程共用）
  preload/
    index.ts                   ← contextBridge，暴露 window.electronAPI
    types.ts                   ← ElectronAPI 类型定义
  main/
    index.ts                   ← 入口：初始化 DB、启动代理、创建窗口、注册 IPC
    utils/
      crypto.ts                ← AES-256-GCM 加密（供应商 API Key 存储）
    db/
      connection.ts            ← 数据库单例 (initDatabase / getDb / closeDatabase)
      database.ts              ← sql.js 封装 (Database, Statement 类)
      schema.ts                ← DDL：5 张表的建表语句
      providers.ts             ← 供应商 CRUD
      api-keys.ts              ← 网关 API Key CRUD
      logs.ts                  ← NDJSON 日志读写 + SQLite 聚合统计
      conversations.ts         ← 对话和消息 CRUD
    proxy/
      server.ts                ← Hono 应用工厂：路由 + 中间件 + 代理逻辑
      router.ts                ← 模型 ID 解析：provider/model → 查 DB
      middleware.ts             ← Bearer token 提取
      forwarder.ts             ← 构建上游请求 URL + Headers
      converter.ts             ← OpenAI ⇄ Anthropic 协议转换（~1045 行）
      manager.ts               ← 代理生命周期管理（start/stop/restart）
      rate-limiter.ts          ← 滑动窗口限流器
    ipc/
      index.ts                 ← 所有 ipcMain.handle / ipcMain.on 处理器
      sse-parser.ts            ← SSE 解析工具（Anthropic + OpenAI 格式）
  renderer/
    main.tsx                   ← React 入口：QueryClient + dark mode
    App.tsx                    ← HashRouter 路由定义
    lib/
      ipc.ts                   ← window.electronAPI 便捷重导出
      utils.ts                 ← cn() 辅助函数 (clsx + tailwind-merge)
      types.ts                 ← 渲染进程类型定义
      queries/
        providers.ts           ← useProviders / useCreateProvider / ...
        apiKeys.ts             ← useApiKeys / useCreateApiKey / ...
        logs.ts                ← useLogs (分页)
        stats.ts               ← useDashboardStats / useHourlyStats / useDailyStats
        proxy.ts               ← useProxyStatus / useToggleProxy / ...
        conversations.ts       ← useConversations / useCreateConversation / ...
    components/
      Layout.tsx               ← 应用壳：侧边栏导航 + <Outlet />
      TitleBar.tsx             ← 无边框窗口标题栏
      StatusBar.tsx            ← 代理状态指示器
      ChatMessage.tsx          ← 聊天气泡（含 Thinking 展开）
      ChatInput.tsx            ← 聊天输入框
      ConversationSidebar.tsx  ← 可折叠会话列表
      StatsCard.tsx            ← 仪表盘统计卡片
      StatsCharts.tsx          ← recharts 图表
      ui/                      ← shadcn/ui 原语 (button, dialog, select, ...)
    pages/
      Dashboard.tsx            ← 总览：统计卡片 + 供应商表格 + 趋势图
      Providers.tsx            ← 供应商 CRUD 管理
      ApiKeys.tsx              ← API Key CRUD 管理
      Logs.tsx                 ← 请求日志查看器
      Chat.tsx                 ← 聊天界面
```

---

## 模块详解

### 1. 数据库层 (`src/main/db/`)

**存储引擎**: sql.js（SQLite 编译为 WASM），整个数据库常驻内存，序列化后写入磁盘。

**单文件持久化**: `config.db` 存放在 `%APPDATA%/llm-gateway/config.db`。

**写入策略**: 2 秒防抖合并写入（`database.ts` 的 `save()`），快速连续写操作只触发一次磁盘 I/O。

**5 张表**:

```
providers              ← 供应商配置（名称、类型、base_url、加密 API Key、模型列表）
api_keys               ← 网关 API Key（SHA-256 哈希查找、加密存储明文）
conversations          ← 聊天会话
messages               ← 聊天消息（含 thinking 字段存储推理内容）
request_stats          ← 全局聚合统计（按 日期+小时）
request_stats_provider ← 供应商维度聚合统计（按 日期+小时+供应商+模型）
```

**日志双写**:
- **NDJSON 文件** (`logs/logs-NNNN.ndjson`): 每请求一行 JSON，滚动分片（最多 10 文件 × 1 万行），用于详细查询
- **SQLite 聚合表**: 每请求 upsert 累加，用于仪表盘快速统计（不读 NDJSON）

### 2. 代理服务器 (`src/main/proxy/`)

核心模块，一个 Hono HTTP 服务器，充当 LLM API 代理。

**请求处理流程**:

```
客户端请求 (POST /v1/chat/completions 或 /v1/messages)
  │
  ├─ 1. CORS 中间件
  ├─ 2. Auth 中间件：提取 Bearer / X-Api-Key，SHA-256 验证
  ├─ 3. Rate Limiter：滑动窗口限流
  │
  ├─ 4. router.ts：解析 "provider/model" 格式
  │     └─ 从 DB 查找 provider，验证 model 存在
  │
  ├─ 5. converter.ts：协议自动检测与转换
  │     └─ 客户端格式 ≠ 供应商格式时，双向转换请求体
  │
  ├─ 6. forwarder.ts：构建上游 URL + Headers
  │     └─ 智能 URL 拼接，避免 /v1 重复
  │
  ├─ 7. fetch 上游 API
  │
  ├─ 8. 响应处理
  │     ├─ 流式：tee 响应体，一路给客户端（可选 SSE 转换），一路提取 token 统计
  │     └─ 非流式：解析 JSON，格式转换后返回
  │
  ├─ 9. 写 NDJSON 日志 + 更新 SQLite 聚合统计
  │
  └─ 10. 返回客户端
```

**模块职责**:

| 文件 | 职责 |
|------|------|
| `server.ts` | Hono 应用工厂，定义路由和中间件，核心 `handleProxyRequest()` 函数 |
| `router.ts` | 解析 `providerName/modelId` 格式，从 DB 查找供应商 |
| `middleware.ts` | 从 Authorization header 提取 Bearer token |
| `forwarder.ts` | 构建上游请求 URL 和 Headers |
| `converter.ts` | OpenAI ⇄ Anthropic 全字段双向转换（请求、响应、SSE 流式） |
| `manager.ts` | 代理服务器生命周期：start / stop / restart / port 管理 |
| `rate-limiter.ts` | 滑动窗口限流器，按 API Key 维度 |

### 3. 协议转换器 (`src/main/proxy/converter.ts`)

项目最复杂的模块（~1045 行），职责是 OpenAI 和 Anthropic API 格式之间的双向转换。

**请求转换**:
- `openaiToAnthropicRequest()` — OpenAI messages → Anthropic messages，处理 system 提取、tool_calls → tool_use、image_url → base64、response_format 映射等
- `anthropicToOpenAIRequest()` — 反向

**响应转换**:
- `anthropicToOpenAIResponse()` — Anthropic message → OpenAI chat completion
- `openAIToAnthropicResponse()` — 反向

**SSE 流式转换**:
- `anthropicSSEToOpenAI()` — Anthropic 事件流 → OpenAI chunks
- `openAISSEToAnthropic()` — OpenAI chunks → Anthropic 事件流（含状态机追踪 content block 切换）

**设计决策**: converter 是一个完整状态机，不应拆分。拆开会破坏跨字段依赖（如 thinking 块的 start/stop 序列）。

### 4. IPC 层 (`src/main/ipc/` + `src/preload/`)

**通信模式**: Electron 标准的 contextBridge 模式。

```
渲染进程                    主进程
window.electronAPI.xxx  →  ipcMain.handle('xxx')
ipcRenderer.send()      →  ipcMain.on()
event.sender.send()     ←  ipcRenderer.on()
```

**IPC 通道分组**:

| 分组 | 通道 | 模式 |
|------|------|------|
| 供应商 | `provider:list/create/update/delete` | invoke → handle |
| API Key | `apikey:list/create/delete` | invoke → handle |
| 日志 | `logs:query/stats/statsDetailed` | invoke → handle |
| 代理 | `proxy:status/start/stop/restart/setPort` | invoke → handle |
| 聊天 | `chat:send` / `chat:chunk` | send → on (流式) |
| 对话 | `conversation:list/create/update/delete/messages/addMessage` | invoke → handle |
| 窗口 | `window:minimize/maximize/close` | send → on |

**Chat 流式传输**是特殊的：`chat:send` 用 `ipcRenderer.send`（fire-and-forget），主进程通过 `event.sender.send('chat:chunk', ...)` 逐块推回渲染进程。

### 5. 渲染进程 (`src/renderer/`)

**技术栈**: React 19 + react-router-dom v7 (HashRouter) + TanStack Query + shadcn/ui + recharts + framer-motion

**路由**:

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | Dashboard | 统计卡片 + 供应商/模型表格 + 24h/30d 趋势图 |
| `/providers` | Providers | 供应商 CRUD 管理 |
| `/api-keys` | ApiKeys | 网关 API Key 管理 |
| `/logs` | Logs | 请求日志查看器（分页 + Debug 详情面板） |
| `/chat` | Chat | 聊天界面（流式 + 会话管理） |

**数据获取模式**: 所有数据通过 TanStack Query hooks 获取（`src/renderer/lib/queries/`），每个数据域一个文件：

- `useQuery` 用于读取
- `useMutation` + `queryClient.invalidateQueries()` 用于写入
- 替代了传统的 `useEffect` + `useState` 模式

**组件结构**:
- `Layout.tsx` — 应用壳，含可折叠侧边栏（Framer Motion 动画）和 `<Outlet />`
- `ui/` — shadcn/ui 原语，通过 `cn()` (clsx + tailwind-merge) 合并类名
- 业务组件与页面文件放在一起（`pages/` 或 `components/`）

### 6. 数据存储总结

| 数据域 | 存储方式 | 位置 | 持久化 |

|--------|----------|------|--------|
| 供应商配置 | sql.js | `config.db` → `providers` | ✅ |
| API Key | sql.js | `config.db` → `api_keys` | ✅ |
| 对话 & 消息 | sql.js | `config.db` → `conversations` + `messages` | ✅ |
| 请求日志详情 | NDJSON | `logs/logs-NNNN.ndjson` | ✅ (滚动) |
| 聚合统计 | sql.js | `config.db` → `request_stats` + `request_stats_provider` | ✅ |
| 代理端口/调试模式 | 内存 | `proxy/manager.ts` 模块变量 | ❌ (重启重置) |
| 调试日志 | 纯文本 | 工作目录 `llm-gateway-*-debug.log` | ✅ |

---

## 测试

测试文件与源码同目录，在 `__tests__/` 子目录中，使用 Vitest + jsdom。

```
src/main/utils/__tests__/crypto.test.ts
src/main/proxy/__tests__/server.test.ts
src/main/proxy/__tests__/router.test.ts
src/main/proxy/__tests__/middleware.test.ts
src/main/proxy/__tests__/forwarder.test.ts
src/main/proxy/__tests__/converter.test.ts        ← 70 tests，最密集
src/main/proxy/__tests__/rate-limiter.test.ts
src/main/db/__tests__/connection.test.ts
src/main/db/__tests__/schema.test.ts
src/main/db/__tests__/providers.test.ts
src/main/db/__tests__/api-keys.test.ts
src/main/db/__tests__/logs.test.ts
src/main/db/__tests__/conversations.test.ts
src/main/ipc/__tests__/sse-parser.test.ts
src/renderer/pages/__tests__/Chat.test.tsx
```

运行: `npm test`（294 tests）

---

## 构建

`electron-vite` 配置三个独立的 Vite 构建：

| 构建 | 入口 | 输出 |
|------|------|------|
| main | `src/main/index.ts` | `out/main/` |
| preload | `src/preload/index.ts` | `out/preload/` |
| renderer | `src/renderer/index.html` | `out/renderer/` |

```bash
npm run dev    # 开发模式 (Electron + Vite HMR)
npm run build  # 生产构建
```

打包使用 `electron-builder`，配置在 `electron-builder.yml`。
