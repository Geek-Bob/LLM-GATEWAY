# LLM Gateway 架构重构设计

> 状态：已确认 | 版本：2.1 | 日期：2026-05-30

## 1. 动机

当前架构存在四个可量化的技术债：

| 问题 | 影响 | 根因 |
|------|------|------|
| SSE 解析写了两遍 | `ipc/index.ts:270-341` 和 `server.ts:411-523` 各有一套 SSE 状态机 | Chat 走 IPC→HTTP 绕路 |
| `ipc/index.ts` 412 行 | 6 个业务域的所有 IPC handler 堆在一个文件 | 未按领域拆分 |
| 加密系统是死代码 | `crypto.ts` 的 AES-256-GCM 从未被调用，`key_encrypted` 列存的是明文 | 安全 theater |
| Markdown 渲染栈：代码块无语法高亮 | `highlight.js` + `rehype-highlight` 在 package.json 中声明但 src/ 零引用；`<code>` 实际只有 Tailwind prose 灰底样式，无 token 级着色 | 只装了依赖但从未集成 |

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

### 4.1 设计原则：宪法 + 部门细则

遵循 Claude Code 官方推荐的分层模型：

```
CLAUDE.md          → 全局宪法（~30 行），每次会话加载
.claude/rules/     → 部门细则，按 paths 条件加载
```

**分工逻辑：**

| 层 | 加载时机 | 适合放什么 |
|----|---------|-----------|
| CLAUDE.md | 每次会话 | 项目定位、构建命令、全局铁律（3-5 条）、指向 rules |
| rules（无 paths） | 每次会话 | 全局适用但不想塞进主文件的主题（版本红线） |
| rules（有 paths） | 读到匹配文件时 | 目录级/技术栈级专项规范 |

**CLAUDE.md 重构后内容（~30 行）：**

```markdown
# LLM Gateway
Electron 42 桌面客户端 — 多 LLM 供应商统一代理 + 聊天 + 仪表盘

## Build & Test
- `npm run dev` — electron-vite dev | `npm run build` — 全量构建
- `npm test` — vitest run | `npm run lint` — eslint src/

## 全局铁律
- 新功能 SDD（spec）→ TDD（Red → Green → Refactor），无例外
- 数据请求走 TanStack Query，禁止组件内裸 fetch
- 中文输出，技术术语保留英文

## 规则模块（按需加载）
- `.claude/rules/00-core.mdc` — 全局禁止项+必须项
- `.claude/rules/10-tech-stack.mdc` — 版本红线和禁止 API
- `.claude/rules/20-directory.mdc` — 目录边界和导入规则
- `.claude/rules/30-main.mdc` — 主进程 domain 模式（模板）
- `.claude/rules/31-renderer.mdc` — 渲染进程 feature 模式（模板）
- `.claude/rules/40-api.mdc` — Hono API 设计规范
- `.claude/rules/50-testing.mdc` — 测试约定
- `.claude/rules/60-security.mdc` — 安全要求

## 架构速览
Renderer → HTTP (localhost:8080) → Hono → domain/* → proxy/* → Provider
例外：apiKeys CRUD 走 IPC（bootstrap），shell/window/update 事件走 IPC
```

### 4.2 规则文件清单（含 paths 条件加载）

```
.claude/rules/
├── 00-core.mdc              # 无 paths → 始终加载
├── 10-tech-stack.mdc        # 无 paths → 始终加载（版本红线全局适用）
├── 20-directory.mdc         # paths: ["src/**"]
├── 30-main.mdc              # paths: ["src/main/**"]
├── 31-renderer.mdc          # paths: ["src/renderer/**"]
├── 40-api.mdc               # paths: ["src/main/domains/**", "src/main/server/**"]
├── 50-testing.mdc           # paths: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]
└── 60-security.mdc          # paths: ["src/main/**"]
```

### 4.3 各规则文件内容定义

**00-core.mdc** — 全局禁止项 + 必须项（无 paths，始终加载）：

```markdown
---
description: 全局禁止项和必须项，覆盖所有目录和文件类型
---

# 禁止
- console.log → 用 `core/logger.ts`
- IPC handler 暴露业务 CRUD（仅 apikey CRUD 除外）
- 组件内直接 fetch / IPC 调用 → 封装在 hooks/
- 跨 feature 导入（`features/chat` → `features/dashboard`）
- `core/` 中引入业务逻辑
- Tailwind 任意值 `h-[13px]` / `w-[27px]` 等

# 必须
- 数据请求走 TanStack Query（`queries/`），不得绕过
- 每个 domain 有且仅有一个 `service.ts` 作为业务入口
- 新功能遵循 TDD：Red → Green → Refactor
- Hono 路由：参数提取 → 调 service → 返回 Response（不超过 50 行）
- `shared/lib/api-client.ts` 统一封装所有 HTTP 请求
```

**10-tech-stack.mdc** — 版本红线 + 禁止 API（无 paths，始终加载）：

```markdown
---
description: 精确技术和版本约束，全局适用
---

| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| TypeScript | 6.0 | `enum`, `namespace`, 装饰器 |
| React | 19.2 | `defaultProps`, `forwardRef`, class 组件 |
| Tailwind | 4.3 | `tailwind.config.ts`, `@layer components` |
| Vite | 6.4 | 额外的 vite.config.ts |
| ESLint | 10.x | `.eslintrc` 格式 |
| Hono | 4.x | 在 `server.ts` 中写路由逻辑 |
| React Router | 7.x | `BrowserRouter`（Electron 用 HashRouter） |
| TanStack Query | 5.x | 字符串 queryKey（用数组 `['key', id]`） |
| Shiki | 最新 | 高亮超过 5 种语言（ts/js/python/json/bash） |
```

**20-directory.mdc** — 目录边界 + 导入规则：

```markdown
---
paths:
  - "src/**"
---

# 目录边界
- 完整目录结构见 spec 第 5 节
- 导入方向（单向依赖）：
  domain.router → domain.service → core/ + proxy/
  feature/hooks/ → shared/lib/api-client.ts → HTTP
  feature/queries/ → shared/lib/api-client.ts → HTTP
  feature/components/ → 纯 UI，只接收 props + 回调

# 禁止
- `renderer/` 导入 `main/` 任何文件（编译隔离）
- `core/` 导入 `domains/` 任何文件（下层不能依赖上层）
- `proxy/` 导入 `domains/` 任何文件（工具层不含业务）
- `shared/` 导入 `features/` 或 `domains/`（共享层不依赖业务）
```

**30-main.mdc** — 主进程 domain 模板：

```markdown
---
paths:
  - "src/main/**"
---

# Domain Pattern（每个 domain 必须遵循）

## 文件结构
domain/{name}/
├── {name}.service.ts   # 业务逻辑，唯一入口
├── {name}.router.ts    # Hono 路由（≤50 行）
├── {name}.schema.ts    # Zod 校验（可选）
└── {name}.types.ts     # 类型定义（可选）

## service.ts 模板
```typescript
import { getDatabase } from '../../core/database'

export function create{Name}Service(db: ReturnType<typeof getDatabase>) {
  return {
    list: async () => { ... },
    getById: async (id: number) => { ... },
    create: async (data: CreateInput) => { ... },
    update: async (id: number, data: UpdateInput) => { ... },
    remove: async (id: number) => { ... },
  }
}

export type {Name}Service = ReturnType<typeof create{Name}Service>
```

## router.ts 模板
```typescript
import { Hono } from 'hono'
import type { {Name}Service } from './{name}.service'

export function create{Name}Router(service: {Name}Service) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const item = await service.create(body)
    return c.json(item, 201)
  })

  return router
}
```

# 禁止
- router 中直接操作数据库（必须走 service）
- service 中直接操作 Request/Response（纯数据层）
- 在 `server/` 中写任何业务路由逻辑
```

**31-renderer.mdc** — 渲染进程 feature 模板：

```markdown
---
paths:
  - "src/renderer/**"
---

# Feature Pattern（每个 feature 必须遵循）

## 文件结构
features/{name}/
├── components/   # 纯 UI 组件（props + 回调，无数据请求）
├── hooks/        # fetch/IPC 封装，返回 { data, error, isLoading }
├── queries/      # TanStack Query hooks（useQuery/useMutation）
└── index.ts      # 公共导出（可选）

## hooks/ 模板
```typescript
import { useState, useEffect } from 'react'
import { apiFetch } from '@/shared/lib/api-client'

export function use{Name}() {
  const [data, setData] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setIsLoading(true)
    apiFetch('/v1/admin/{name}')
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false))
  }, [])

  return { data, isLoading, error }
}
```

## queries/ 模板
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/lib/api-client'

export function use{Name}s() {
  return useQuery({
    queryKey: ['{name}s'],
    queryFn: () => apiFetch('/v1/admin/{name}s').then(r => r.json()),
  })
}
```

# 禁止
- 组件中直接调用 `fetch()` 或 `window.electronAPI`
- hooks/ 返回 JSX（纯数据层）
- components/ 中使用 useQuery（走 queries/）
- 跨 feature 导入组件或 hooks
```

**40-api.mdc** — Hono API 设计规范：

```markdown
---
paths:
  - "src/main/domains/**"
  - "src/main/server/**"
---

# API 约定

## URL 模式
- 管理类：`/v1/admin/{resource}` + `/:id`
- 功能类：`/v1/{action}`（如 `/v1/chat/completions`）
- 代理类：`/v1/proxy/{provider}/{model}/*`

## 响应格式
- 成功：直接返回 JSON 对象或数组（不包裹外层 envelope）
- 列表：返回数组 `[{...}, {...}]`
- 错误：`{ error: string, code?: string }` + 对应 HTTP 状态码
- 创建：返回创建后的对象 + 201 状态码

## 中间件
- `auth.ts`：提取 Authorization Bearer token → 校验 gateway API key
- `rate-limit.ts`：每个 API key 每分钟最多 60 次请求
- 中间件失败返回 `{ error: "..." }` + 401/429 状态码

## 禁止
- 路由文件超过 50 行
- 在路由中直接操作数据库
- 使用 Hono 之外的 HTTP 框架
```

**50-testing.mdc** — 测试约定：

```markdown
---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
---

# 测试框架
- vitest + jsdom（渲染进程组件测试）
- 测试文件与源文件 co-located：`src/**/__tests__/xxx.test.ts`
- 禁止 mock 数据库（集成测试用真实 sql.js 内存库）

# 编写原则
- 每个 service.ts 必须有对应的 service.test.ts
- 每个 router.ts 必须有对应的 router.test.ts（用 Hono test client）
- 组件测试：测试交互行为，不测试实现细节
- TDD 流程：Red（写失败测试）→ Green（最小实现）→ Refactor（优化）

# 禁止
- 测试中使用真实网络请求（用 MSW 或 fetch mock）
- 测试文件导入未测试的 feature 模块
```

**60-security.mdc** — 安全要求：

```markdown
---
paths:
  - "src/main/**"
---

# 安全边界
- 本应用为本地桌面客户端，所有通信在 localhost 内进行
- API Key 明文存储（本地文件系统，无网络暴露风险）
- 无加密/解密逻辑（已删除 crypto.ts，不回退）

# 代理安全
- 上游 Provider API Key 通过 Authorization/X-Api-Key 头透传
- 代理只监听 localhost（127.0.0.1），不对外暴露端口
- 不做 HTTPS 证书校验（本地回环可信）

# 禁止
- 重新引入任何加密/解密函数
- 将 API Key 写入日志或 NDJSON
- 代理监听 0.0.0.0（除非用户明确配置局域网共享）
```

### 4.4 编写原则（基于实际教训）

1. **"禁止"优先** — 每个 rules 文件以禁止项开头，禁止项比必须项更重要
2. **模板优于原则** — 30-main.mdc 和 31-renderer.mdc 各含可复制的完整模板，减少 AI 猜测空间
3. **瘦文件** — 每个 .mdc ≤ 50 行（不含模板），CLAUDE.md ≤ 30 行
4. **paths 条件加载** — 除 00-core 和 10-tech-stack 外，所有 rules 必须声明 paths，避免无关上下文污染
5. **基于反例** — 规则来源于本次重构发现的屎山实例（两层 SSE → 40-api 路由行数限制、死加密 → 60-security 禁止加密）
6. **CLAUDE.md 只做索引** — 不重复 rules 内容，只列文件名和一行描述，指向 rules 目录

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
| `package.json` 中的 `highlight.js` | 替换为 `shiki`（VS Code 品质高亮，dark-plus 主题） |
| `package.json` 中的 `rehype-highlight` | highlight.js 的 rehype 桥接，一并替换 |

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
| `src/renderer/components/ui/markdown.tsx` | 核心架构不变，仅 code 渲染器接入 Shiki |
| `src/renderer/components/ui/mermaid.tsx` | Mermaid 渲染逻辑不变 |
| `src/renderer/components/ui/*` (其余 18 个) | shadcn 原语，无业务依赖 |
| `src/renderer/index.css` | Tailwind v4 配置已就绪 |
| `src/renderer/main.tsx` | 入口逻辑不变（QueryClient + HashRouter + dark） |
| `src/main/index.ts` (入口) | 窗口+托盘逻辑不变 |
| `src/main/update/*` | 自动更新逻辑不变 |
| `package.json` scripts | dev/build/test/lint 命令不变 |
| `electron.vite.config.ts` | 构建配置不变 |
| `eslint.config.mjs` | Lint 配置不变 |
| `vitest.config.ts` | 测试配置不变 |

### 7.5 Markdown 渲染栈决策

**当前实际使用（4 个包）：**
```
react-markdown → Markdown → React 组件树
remark-gfm     → GFM 表格/删除线/任务列表
rehype-raw     → 支持 Markdown 中内嵌原始 HTML
mermaid        → ```mermaid 代码块 → SVG 图表
```

**当前死依赖（即将移除）：**
```
highlight.js      → 70KB gzipped，0 import
rehype-highlight  → 桥接层，0 import
```

**新增（替代 highlight.js）：**
```
shiki → VS Code token 级语法高亮引擎
  - dark-plus 主题（与 macOS Liquid Glass 暗色完美匹配）
  - 初始支持 5 语言：ts, js, python, json, bash（按需扩展）
  - 高亮时机：isStreaming=false 时执行（与 Mermaid 模式一致）
  - ~50KB gzipped（core + 5 lang + 1 theme，比 highlight.js 轻 30%）
```

**代码块渲染规则：**

| 语言标记 | 流式中 | 完成后 |
|---------|--------|--------|
| ` ```mermaid ` | 显示灰色占位 "图表渲染中…" | `MermaidBlock` → SVG |
| ` ```ts ` 等 | 纯文本 `<pre><code>` + prose 灰底 | Shiki `codeToHtml()` → 彩色 token |
| 无语言标记 | 纯文本 `<pre><code>` + prose 灰底 | 纯文本 `<pre><code>` + prose 灰底 |

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
