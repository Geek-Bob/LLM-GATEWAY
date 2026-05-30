# LLM Gateway 架构重构设计

> 状态：已确认 | 版本：2.0 | 日期：2026-05-30

## 1. 动机

当前架构存在四个可量化的技术债：

| 问题 | 影响 | 根因 |
|------|------|------|
| SSE 解析写了两遍 | `ipc/index.ts:270-341` 和 `server.ts:411-523` 各有一套 SSE 状态机 | Chat 走 IPC→HTTP 绕路 |
| `ipc/index.ts` 412 行 | 6 个业务域的所有 IPC handler 堆在一个文件 | 未按领域拆分 |
| 加密系统是死代码 | `crypto.ts` 的 AES-256-GCM 从未被调用，`key_encrypted` 列存的是明文 | 安全 theater |
| `highlight.js` + `rehype-highlight` 零引用 | package.json 声明但 src/ 全项目无 import | 遗留依赖 |

**原则：** 不计成本重构，每条原则写入 rules 文件作为后续开发的合同。

## 2. 总体架构

```
┌──────────────────────────────────────────────────────┐
│ Renderer (React 19 + Vite 6)                         │
│                                                      │
│  features/{chat,dashboard,settings}/*                 │
│    hooks/          ← fetch/IPC 封装                   │
│    queries/        ← TanStack Query v5                │
│    components/     ← 纯 UI (props + 回调)             │
│                                                      │
│  shared/lib/api-client.ts ← fetch 封装: baseUrl+auth │
│                                                      │
│  ──── HTTP (localhost:8080) ──── all business APIs   │
│  ──── IPC ──── apiKeys CRUD only (bootstrap)         │
│  ──── IPC ──── window + shell + update events        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Main: Hono Server (:8080)                            │
│                                                      │
│  server/middleware/auth.ts     → gateway API key 认证 │
│  server/middleware/rate-limit.ts                      │
│  server/routes.ts              → 注册所有 domain 路由 │
│                                                      │
│  domains/                                              │
│    chat/chat.router.ts   + chat.service.ts            │
│    provider/provider.router.ts + provider.service.ts   │
│    apikey/apikey.router.ts   + apikey.service.ts      │
│    stats/stats.router.ts     + stats.service.ts       │
│    logs/logs.router.ts       + logs.service.ts        │
│    conversation/conversation.router.ts + service.ts    │
│                                                      │
│  proxy/                                               │
│    forwarder.ts  → URL 拼接 + Header 构建             │
│    converter.ts  → OpenAI↔Anthropic 协议 + SSE 转换   │
│                                                      │
│  core/                                                │
│    database.ts   → sql.js 连接                        │
│    logger.ts     → 统一日志（替代散落 debugFileLog）   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Preload (contextBridge)                               │
│                                                      │
│  壳能力 only:                                        │
│    window: { minimize, maximize, close }              │
│    shell: { openExternal, getAppVersion }             │
│    apiKeys: { list, create, delete }   ← 启动引导    │
│    on: { updateAvailable, updateProgress }            │
│    debug: { log }                                    │
└──────────────────────────────────────────────────────┘
```

## 3. 核心设计决策

### 3.1 明文存储（无加密）

- 删除 `src/main/utils/crypto.ts` 全文（42 行，AES-256-GCM 从未被调用）
- `api_keys` 表 `key_encrypted` 列重命名为 `key`
- `providers` 表 `api_key_encrypted` 列重命名为 `api_key`
- 移除 `tryDecrypt()` 和 `ENCRYPTION_SECRET` 相关逻辑
- 受益：消除 ~60 行死代码 + 减少安全 theater 给 AI 带来的困惑

### 3.2 Renderer 直连 Hono（消除 IPC→HTTP 绕路）

- Chat 流式消息：Renderer 用 `fetch('http://localhost:8080/v1/chat/completions', {...})` 直连 Hono，浏览器原生 ReadableStream 消费 SSE
- 所有 CRUD 操作（providers, logs, stats, conversations）走 Hono HTTP API
- `.claude/rules/` 分层体系（8 个 .mdc 文件），基于 MSEC 四大原则
- 禁止项 + 模板代码 + 精确版本红线

## 4. 规则体系

### 4.1 文件清单

```
.claude/rules/
├── 00-core.mdc              # Always Apply — 全局铁律
├── 10-tech-stack.mdc        # 精确版本 + 禁区
├── 20-directory.mdc         # 目录边界 + 导入规则
├── 30-main.mdc              # 主进程 domain pattern 模板
├── 31-renderer.mdc          # 渲染进程 feature pattern 模板
├── 40-api.mdc               # Hono API 设计规范
├── 50-testing.mdc           # 测试规范（从现有精简）
└── 60-security.mdc          # 安全要求（从现有精简）
```

### 4.2 核心规则内容

**00-core.mdc** — 全局铁律：

```
禁止：
- console.log（用 core/logger.ts）
- IPC handler 暴露业务 CRUD（仅 apikey CRUD 除外）
- 组件内直接 fetch/IPC（封装在 hooks/）
- 跨 feature 导入（features/chat → features/dashboard）
- core/ 中引入业务逻辑
- Tailwind 任意值

必须：
- 数据请求走 TanStack Query（queries/）
- 每个 domain 有且仅有一个 service.ts 作为业务入口
- 新功能遵循 TDD: Red → Green → Refactor
- Hono 路由只做参数提取 + 调用 service + 返回 Response
```

**10-tech-stack.mdc** — 精确版本红线：

| 技术 | 版本 | 禁止 |
|------|------|------|
| TypeScript | 6.0 | enum, namespace, decorators |
| React | 19.2 | defaultProps, forwardRef, class component |
| Tailwind | 4.3 | tailwind.config.ts, @layer components |
| Vite | 6.4 | 额外 vite.config.ts |
| ESLint | 10.x | .eslintrc |
| Hono | 4.x | 在 server.ts 中写路由逻辑 |
| React Router | 7.x | BrowserRouter |
| TanStack Query | 5.x | 字符串 queryKey |

**20-directory.mdc** — 目录边界：
- 完整目录结构见第 5 节
- 导入规则：domain.router → domain.service → core/ + proxy/

### 4.3 编写原则（基于实际教训）

1. **"禁止"优先** — 每个文件以禁止项开头
2. **模板优于原则** — 30-main.mdc 和 31-renderer.mdc 各含完整模板
3. **瘦文件** — 每个 .mdc ≤ 50 行
4. **基于反例** — 规则来源于本次重构发现的屎山（两层 SSE、死加密、大文件）

## 5. 目标目录结构

```
src/
├── main/
│   ├── index.ts
│   ├── core/
│   │   ├── database.ts
│   │   └── logger.ts
│   ├── domains/
│   │   ├── chat/
│   │   │   ├── chat.service.ts
│   │   │   ├── chat.router.ts
│   │   │   └── chat.types.ts
│   │   ├── provider/
│   │   │   ├── provider.service.ts
│   │   │   ├── provider.router.ts
│   │   │   ├── provider.schema.ts
│   │   │   └── provider.types.ts
│   │   ├── apikey/
│   │   │   ├── apikey.service.ts
│   │   │   ├── apikey.router.ts
│   │   │   ├── apikey.schema.ts
│   │   │   └── apikey.types.ts
│   │   ├── stats/
│   │   │   ├── stats.service.ts
│   │   │   ├── stats.router.ts
│   │   │   └── stats.schema.ts
│   │   ├── logs/
│   │   │   ├── logs.service.ts
│   │   │   ├── logs.router.ts
│   │   │   └── logs.schema.ts
│   │   └── conversation/
│   │       ├── conversation.service.ts
│   │       ├── conversation.router.ts
│   │       └── conversation.schema.ts
│   ├── proxy/
│   │   ├── forwarder.ts
│   │   └── converter.ts
│   ├── server/
│   │   ├── index.ts
│   │   ├── routes.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── rate-limit.ts
│   └── update/
│       ├── manager.ts
│       └── ipc.ts
│
├── renderer/
│   ├── index.html
│   ├── index.css
│   ├── main.tsx
│   ├── features/
│   │   ├── chat/
│   │   │   ├── components/        ChatMessage, ChatInput, ConversationSidebar
│   │   │   ├── hooks/             useChatStream, useChatMessages
│   │   │   └── queries/           conversations.ts
│   │   ├── dashboard/
│   │   │   ├── components/        StatsCard, StatsCharts, StatusBar
│   │   │   ├── hooks/             useStatsRange
│   │   │   └── queries/           stats.ts
│   │   └── settings/
│   │       ├── providers/         components/ + queries/
│   │       ├── apikeys/           components/ + queries/
│   │       └── logs/              components/ + queries/
│   ├── shared/
│   │   ├── components/
│   │   │   ├── ui/                shadcn 原语（20 个）
│   │   │   ├── Layout.tsx
│   │   │   ├── TitleBar.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   └── lib/
│   │       ├── api-client.ts      fetch 封装
│   │       ├── cn.ts
│   │       ├── types.ts
│   │       └── ipc.ts             window.electronAPI 薄封装
│   └── app/
│       ├── router.tsx
│       ├── Layout.tsx
│       └── pages/                 ChatPage, DashboardPage, ProvidersPage, ...
│
├── preload/
│   └── index.ts                   壳能力 + apiKeys CRUD
│
└── shared/
    └── types.ts                   跨进程共享类型
```

## 6. 核心数据流

### 6.1 Chat 流式消息（重构后唯一路径）

```
Renderer: features/chat/hooks/useChatStream.ts
  │
  │  const response = await apiFetch('/v1/chat/completions', {
  │    method: 'POST',
  │    body: JSON.stringify({ model, messages, stream: true })
  │  })
  │  const reader = response.body.getReader()
  │  while (true) {
  │    const { done, value } = await reader.read()
  │    // 原生 ReadableStream，不需要自定义 SSE parser
  │  }
  │
  ▼ HTTP localhost:8080
Main: Hono
  │
  ├── middleware/auth.ts       → verifyApiKey(token)
  ├── middleware/rate-limit.ts → check quota
  ├── chat.router.ts           → 提取 model/messages，调 service
  ├── chat.service.ts          → resolveProvider, 组装请求参数
  ├── proxy/forwarder.ts       → 构建上游客 URL + Headers
  ├── proxy/converter.ts       → 如有格式差异，SSE 流转换（唯一转换点）
  │
  ▼ HTTPS
LLM Provider (OpenAI / Anthropic / ...)
```

**关键：** SSE 解析只在 `proxy/converter.ts` 发生一次。Renderer 消费的是标准 SSE 流。

### 6.2 管理类操作（CRUD）

```
Renderer: features/settings/providers/queries/providers.ts
  │
  │  useQuery({ queryKey: ['providers'], queryFn: () =>
  │    apiFetch('/v1/admin/providers') })
  │
  ▼ HTTP localhost:8080
Main: domain/provider/provider.router.ts
  │
  ├── GET    /v1/admin/providers     → provider.service.list()
  ├── POST   /v1/admin/providers     → provider.service.create(body)
  ├── PUT    /v1/admin/providers/:id → provider.service.update(id, body)
  ├── DELETE /v1/admin/providers/:id → provider.service.remove(id)
  │
  ▼
provider.service.ts → core/database.ts → sql.js
```

### 6.3 API Key 引导路径（唯一保留的 IPC 业务调用）

```
首次启动:
  Renderer → IPC: apikey:list → 空
  Renderer → Settings 页 → 用户创建 key
  Renderer → IPC: apikey:create('my-key', 60) → { plaintextKey, key }
  Renderer → setApiKey(plaintextKey) → 所有后续请求走 HTTP

后续启动:
  Renderer → IPC: apikey:list → 获取既有 key
  Renderer → 用第一个活跃 key 的 plaintext 调 Hono
```

## 7. 改动清单

### 7.1 删除

| 文件 | 原因 |
|------|------|
| `src/main/utils/crypto.ts` | 加密函数从未被调用 |
| `src/main/utils/__tests__/crypto.ts` | 相关测试 |
| `package.json` 中的 `highlight.js` | src/ 零引用 |
| `package.json` 中的 `rehype-highlight` | src/ 零引用 |

### 7.2 新建

| 路径 | 职责 |
|------|------|
| `.claude/rules/00-core.mdc` | 全局铁律 |
| `.claude/rules/10-tech-stack.mdc` | 技术栈版本红线 |
| `.claude/rules/20-directory.mdc` | 目录边界 |
| `.claude/rules/30-main.mdc` | 主进程 domain 模板 |
| `.claude/rules/31-renderer.mdc` | 渲染进程 feature 模板 |
| `.claude/rules/40-api.mdc` | Hono API 规范 |
| `src/main/core/logger.ts` | 统一日志接口 |
| `src/main/domains/{chat,provider,apikey,stats,logs,conversation}/*` | 6 个领域 × 2-3 文件 |
| `src/main/server/index.ts` | Hono app 生命周期 |
| `src/main/server/routes.ts` | 路由注册 |
| `src/main/server/middleware/auth.ts` | 认证中间件 |
| `src/main/server/middleware/rate-limit.ts` | 频率限制中间件 |
| `src/renderer/shared/lib/api-client.ts` | fetch 封装 |
| `src/renderer/features/chat/hooks/useChatStream.ts` | SSE 流消费 |
| `src/renderer/app/` | 路由+布局+页面 |

### 7.3 重构

| 当前文件 | 目标 |
|------|------|
| `src/main/ipc/index.ts` (412 行) | 拆分为 preload IPC（壳能力+apikey）+ 其余移入 domain routers |
| `src/main/proxy/server.ts` (677 行) | 路由逻辑移入 domain routers；纯 Hono 创建 + 中间件留在 server/index.ts |
| `src/main/proxy/converter.ts` | 解耦 debugInfo 闭包依赖，改为纯函数 |
| `src/main/proxy/manager.ts` | 简化，适配新的 server/ 结构 |
| `src/main/db/api-keys.ts` | 移除 tryDecrypt，列重命名 |
| `src/main/db/providers.ts` | 移除 tryDecrypt，列重命名 |
| `src/main/db/schema.ts` | DDL 列重命名 |
| `src/renderer/pages/Chat.tsx` | 迁移到 app/pages/，用 useChatStream hook |
| `src/renderer/lib/queries/*` | 迁移到 features/*/queries/ |
| `src/preload/index.ts` | 精简为壳能力 + apiKeys |

### 7.4 不变

| 文件 | 原因 |
|------|------|
| `src/renderer/components/ui/*` (20 个) | shadcn 原语，无业务依赖 |
| `src/renderer/index.css` | Tailwind v4 配置已就绪 |
| `src/renderer/main.tsx` | 入口逻辑不变（QueryClient + HashRouter + dark） |
| `src/main/index.ts` (入口) | 窗口+托盘逻辑不变 |
| `src/main/update/*` | 自动更新逻辑不变 |
| `package.json` scripts | dev/build/test/lint 命令不变 |
| `electron.vite.config.ts` | 构建配置不变 |
| `eslint.config.mjs` | Lint 配置不变 |
| `vitest.config.ts` | 测试配置不变 |

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 重构期间功能回归 | Chat/代理不可用 | 优先搭建新 domain 框架 → 逐域迁移 → 全量测试 |
| `proxy/converter.ts` 改动引入 SSE bug | 流式消息异常 | converter 核心逻辑不变，只解耦 debugInfo |
| preload 精简后遗漏必需 API | 某些功能失效 | 全量审计现有 IPC handler 调用方 |
| 294 个测试需适配 | 大量测试失败 | 先跑全量测试 → 建立基线 → 逐域迁移测试 |
| 目录重构后 import 断裂 | 编译失败 | TypeScript strict mode + TSC 编译检查 |

## 9. 验收标准

1. `npm run dev` 启动成功，Chat 发送消息正常（流式+非流式）
2. 管理局域网设备访问 `http://host-ip:8080` 正常
3. `npm test` 全量 294 测试通过或适配完成
4. `npm run build` 全量构建成功
5. `npm run lint` 无新增错误
6. 删除 `highlight.js`、`rehype-highlight`、`crypto.ts` 后无编译错误
7. SSE 解析逻辑只在 `proxy/converter.ts` 中存在（grep 验证）
8. `ipc/index.ts` 不再包含业务 CRUD handler（仅壳能力 + apiKeys）
9. 每个 domain 的 router 不超过 50 行
10. `.claude/rules/` 8 个文件全部就位且内容通过 Code Review
