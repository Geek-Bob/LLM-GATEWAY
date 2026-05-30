# LLM Gateway 架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LLM Gateway 从"IPC→HTTP 绕路 + 死加密 + 大文件"架构重构为"Renderer 直连 Hono + 明文 + Domain 分层"的干净架构。

**Architecture:** Renderer 通过 api-client.ts 直连 localhost:8080 Hono 服务器；主进程按 domain 拆分（chat/provider/apikey/stats/logs/conversation），每个 domain 含 service + router；SSE 解析只在 proxy/converter.ts 发生一次；预加载精简为壳能力 + apiKeys CRUD。

**Tech Stack:** Electron 42, electron-vite 5, TypeScript 6.0, React 19.2, Hono 4, TanStack Query 5, Tailwind 4.3, sql.js, shiki, vitest

**关键约束:** Phase 0 必须先创建全部 rules 文件并精简 CLAUDE.md，后续所有 Phase 的子代理都会加载对应 rules，确保代码不偏离设计。

---

## Phase 0: 规则体系 + CLAUDE.md（最先执行，无例外）

### Task 0.1: 精简 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 替换 CLAUDE.md 为精简版**

用以下内容完整替换 `CLAUDE.md`：

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
- `.claude/rules/00-core.md` — 全局禁止项+必须项
- `.claude/rules/10-tech-stack.md` — 版本红线和禁止 API
- `.claude/rules/20-directory.md` — 目录边界和导入规则
- `.claude/rules/30-main.md` — 主进程 domain 模式（模板）
- `.claude/rules/31-renderer.md` — 渲染进程 feature 模式（模板）
- `.claude/rules/40-api.md` — Hono API 设计规范
- `.claude/rules/50-testing.md` — 测试约定
- `.claude/rules/60-security.md` — 安全要求

## 架构速览
Renderer → HTTP (localhost:8080) → Hono → domain/* → proxy/* → Provider
例外：apiKeys CRUD 走 IPC（bootstrap），shell/window/update 事件走 IPC
```

- [ ] **Step 2: 验证文件行数 ≤ 30 行**

```bash
wc -l CLAUDE.md
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: 精简 CLAUDE.md 为全局宪法（~25 行）"
```

### Task 0.2: 创建 00-core.md + 10-tech-stack.md（全局加载，无 paths）

**Files:**
- Create: `.claude/rules/00-core.md`
- Create: `.claude/rules/10-tech-stack.md`

- [ ] **Step 1: 创建 .claude/rules/ 目录**

```bash
mkdir -p .claude/rules
```

- [ ] **Step 2: 创建 00-core.md**

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

- [ ] **Step 3: 创建 10-tech-stack.md**

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

- [ ] **Step 4: 提交**

```bash
git add .claude/rules/00-core.md .claude/rules/10-tech-stack.md
git commit -m "feat: 创建全局规则 00-core + 10-tech-stack"
```

### Task 0.3: 创建 20-directory.md（按路径加载）

**Files:**
- Create: `.claude/rules/20-directory.md`

- [ ] **Step 1: 创建 20-directory.md**

```markdown
---
paths:
  - "src/**"
---

# 目录边界
- 完整目录结构见 `docs/superpowers/specs/2026-05-30-architecture-refactoring-design.md` 第 5 节
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

- [ ] **Step 2: 提交**

```bash
git add .claude/rules/20-directory.md
git commit -m "feat: 创建目录边界规则 20-directory"
```

### Task 0.4: 创建 30-main.md + 31-renderer.md（带模板的 domain/feature 规则）

**Files:**
- Create: `.claude/rules/30-main.md`
- Create: `.claude/rules/31-renderer.md`

- [ ] **Step 1: 创建 30-main.md**

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

- [ ] **Step 2: 创建 31-renderer.md**

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

- [ ] **Step 3: 提交**

```bash
git add .claude/rules/30-main.md .claude/rules/31-renderer.md
git commit -m "feat: 创建主进程+渲染进程 domain/feature 模板规则"
```

### Task 0.5: 创建 40-api.md + 50-testing.md + 60-security.md（专项规则）

**Files:**
- Create: `.claude/rules/40-api.md`
- Create: `.claude/rules/50-testing.md`
- Create: `.claude/rules/60-security.md`

- [ ] **Step 1: 创建 40-api.md**

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

- [ ] **Step 2: 创建 50-testing.md**

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

- [ ] **Step 3: 创建 60-security.md**

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

- [ ] **Step 4: 提交**

```bash
git add .claude/rules/40-api.md .claude/rules/50-testing.md .claude/rules/60-security.md
git commit -m "feat: 创建 API/测试/安全专项规则"
```

### Task 0.6: Phase 0 验收 + 删除旧 rules

**Files:**
- Delete: `.claude/rules/testing.md`（已被 50-testing.md 替代）
- Delete: `.claude/rules/code-style.md`（已被 00-core + 20-directory 替代）
- Delete: `.claude/rules/security.md`（已被 60-security.md 替代）

- [ ] **Step 1: 验证 8 个 rules 文件全部存在**

```bash
ls -la .claude/rules/
```

期望输出包含：`00-core.md`, `10-tech-stack.md`, `20-directory.md`, `30-main.md`, `31-renderer.md`, `40-api.md`, `50-testing.md`, `60-security.md`

- [ ] **Step 2: 删除旧的 rules 文件**

```bash
rm .claude/rules/testing.md .claude/rules/code-style.md .claude/rules/security.md 2>/dev/null; echo "done"
```

- [ ] **Step 3: 提交**

```bash
git add .claude/rules/
git commit -m "chore: 完成 Phase 0 规则体系，删除旧 rules"
```

---

## Phase 1: 删除死代码

### Task 1.1: 删除 crypto.ts + 相关测试

**Files:**
- Delete: `src/main/utils/crypto.ts`
- Delete: `src/main/utils/__tests__/crypto.ts`（如果存在）

- [ ] **Step 1: 确认 encrypt() 函数零调用**

```bash
grep -r "encrypt\|decrypt" src/ --include="*.ts" --include="*.tsx" | grep -v "tryDecrypt\|key_encrypted\|crypto.ts\|\.d\.ts" || echo "NO_MATCHES"
```

期望输出: `NO_MATCHES`（encrypt/decrypt 只在 crypto.ts 自身定义 + tryDecrypt 调用中，无其他引用）

- [ ] **Step 2: 检查 crypto.ts 是否有测试文件**

```bash
ls src/main/utils/__tests__/crypto* 2>/dev/null || echo "no test file"
```

- [ ] **Step 3: 删除 crypto.ts（和测试文件，如果存在）**

```bash
rm src/main/utils/crypto.ts
rm src/main/utils/__tests__/crypto.ts 2>/dev/null; echo "done"
```

- [ ] **Step 4: 提交**

```bash
git add -u
git commit -m "refactor: 删除死代码 crypto.ts（AES-256-GCM 从未被调用）"
```

### Task 1.2: 移除 highlight.js + rehype-highlight 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 确认零引用**

```bash
grep -r "highlight\.js\|highlightjs\|rehype-highlight" src/ --include="*.ts" --include="*.tsx" || echo "ZERO_IMPORTS"
```

- [ ] **Step 2: 从 package.json 移除两个依赖**

用 Edit 工具从 `package.json` 删除这两行：
- `"highlight.js": "^11.11.1",`
- `"rehype-highlight": "^7.0.2",`

- [ ] **Step 3: 重新安装依赖**

```bash
npm install
```

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 移除死依赖 highlight.js + rehype-highlight"
```

---

## Phase 2: 核心基础设施

### Task 2.1: 创建 core/logger.ts（统一日志接口）

**Files:**
- Create: `src/main/core/logger.ts`
- Test: `src/main/core/__tests__/logger.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/main/core/__tests__/logger.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLogger } from '../logger'

describe('createLogger', () => {
  it('返回包含 info/warn/error/debug 方法的对象', () => {
    const logger = createLogger('test-module')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('info 方法接收消息和可选 data', () => {
    const logger = createLogger('test')
    // 不应抛出异常
    expect(() => logger.info('test message')).not.toThrow()
    expect(() => logger.info('test message', { key: 'value' })).not.toThrow()
  })

  it('在模块名前缀中包含 moduleName', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = createLogger('my-module')
    logger.info('hello')
    expect(consoleSpy).toHaveBeenCalled()
    const call = consoleSpy.mock.calls[0]
    expect(call[0]).toContain('my-module')
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/main/core/__tests__/logger.test.ts
```

期望：FAIL — Cannot find module '../logger'

- [ ] **Step 3: 实现 createLogger**

创建 `src/main/core/logger.ts`：

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

export function createLogger(moduleName: string): Logger {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level.toUpperCase()}] [${moduleName}]`
    const payload = data ? ` ${JSON.stringify(data)}` : ''
    const line = `${prefix} ${message}${payload}`

    switch (level) {
      case 'error': console.error(line); break
      case 'warn': console.warn(line); break
      case 'debug': console.debug(line); break
      default: console.log(line); break
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/main/core/__tests__/logger.test.ts
```

期望：3 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/core/logger.ts src/main/core/__tests__/logger.test.ts
git commit -m "feat: 创建统一日志接口 core/logger.ts"
```

### Task 2.2: 数据库列重命名（key_encrypted → key, api_key_encrypted → api_key）

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: 更新 schema.ts 的 DDL 列名**

将 `src/main/db/schema.ts` 中的列名更新：

```typescript
// 第 36 行：api_keys 表
key_encrypted TEXT NOT NULL DEFAULT '',
// 改为：
key TEXT NOT NULL DEFAULT '',
```

```typescript
// 第 12 行：providers 表
api_key_encrypted TEXT NOT NULL,
// 改为：
api_key TEXT NOT NULL,
```

```typescript
// 第 76 行：migration ALTER
db.exec(`ALTER TABLE api_keys ADD COLUMN key_encrypted TEXT NOT NULL DEFAULT ''`)
// 改为：
db.exec(`ALTER TABLE api_keys ADD COLUMN key TEXT NOT NULL DEFAULT ''`)
```

- [ ] **Step 2: 提交**

```bash
git add src/main/db/schema.ts
git commit -m "refactor: 数据库列重命名 key_encrypted→key, api_key_encrypted→api_key"
```

### Task 2.3: 更新 api-keys.ts（移除 tryDecrypt，列名适配）

**Files:**
- Modify: `src/main/db/api-keys.ts`
- Test: `src/main/db/__tests__/api-keys.test.ts`

- [ ] **Step 1: 重写 api-keys.ts（无加密逻辑）**

用以下内容完整替换 `src/main/db/api-keys.ts`：

```typescript
import crypto from 'crypto'
import { getDb } from './connection'

export interface ApiKeyRow {
  id: number
  name: string
  key_prefix: string
  key_hash: string
  key: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface ApiKeyResult {
  plaintextKey: string
  key: Omit<ApiKeyRow, 'key_hash' | 'key'>
}

function generateApiKey(): { plaintextKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(36).toString('base64url')
  const plaintextKey = 'sk-' + randomPart
  const keyPrefix = plaintextKey.slice(0, 8)
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex')
  return { plaintextKey, keyPrefix, keyHash }
}

function hashKey(plaintextKey: string): string {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex')
}

export function createApiKey(name: string, rateLimit: number = 60): ApiKeyResult {
  const db = getDb()
  const { plaintextKey, keyPrefix, keyHash } = generateApiKey()

  const stmt = db.prepare(`
    INSERT INTO api_keys (name, key_prefix, key_hash, key, rate_limit)
    VALUES (@name, @key_prefix, @key_hash, @key, @rate_limit)
  `)

  stmt.run({
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    key: plaintextKey,
    rate_limit: rateLimit
  })

  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ?'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash' | 'key'>

  return {
    plaintextKey,
    key: row
  }
}

export function getApiKeyPlaintext(id: number): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT key FROM api_keys WHERE id = ?'
  ).get(id) as { key: string } | undefined
  if (!row || !row.key) return null
  return row.key
}

export function verifyApiKey(plaintextKey: string): Omit<ApiKeyRow, 'key_hash'> | null {
  const db = getDb()
  const keyHash = hashKey(plaintextKey)
  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash'> | undefined
  return row || null
}

export function listApiKeys(): (Omit<ApiKeyRow, 'key_hash' | 'key'> & { key_plaintext: string })[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, name, key_prefix, key, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
  ).all() as unknown as ApiKeyRow[]

  return rows.map((row) => {
    const { key_hash, key, ...rest } = row
    return { ...rest, key_plaintext: key }
  })
}

export function getApiKeyById(
  id: number
): Omit<ApiKeyRow, 'key_hash' | 'key'> | undefined {
  const db = getDb()
  return db
    .prepare(
      'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE id = ?'
    )
    .get(id) as Omit<ApiKeyRow, 'key_hash' | 'key'> | undefined
}

export function deleteApiKey(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}
```

- [ ] **Step 2: 确认无 encrypt/decrypt/tryDecrypt/ENCRYPTION_SECRET 残留**

```bash
grep -n "encrypt\|decrypt\|tryDecrypt\|ENCRYPTION_SECRET" src/main/db/api-keys.ts || echo "CLEAN"
```

期望输出: `CLEAN`

- [ ] **Step 3: 提交**

```bash
git add src/main/db/api-keys.ts
git commit -m "refactor: api-keys 移除 tryDecrypt，列重命名为 key"
```

### Task 2.4: 更新 providers.ts（移除 tryDecrypt，列名适配）

**Files:**
- Modify: `src/main/db/providers.ts`

- [ ] **Step 1: 移除 crypto 导入和 tryDecrypt**

删除 `src/main/db/providers.ts` 的第 1-3 行：
```typescript
import { getDb } from './connection'
import { decrypt } from '../utils/crypto'
```

替换为：
```typescript
import { getDb } from './connection'
```

删除第 33 行 `columnMap` 中的 `apiKey: 'api_key_encrypted'`，改为：
```typescript
apiKey: 'api_key',
```

删除第 45-53 行整个 if 块：
```typescript
const ENCRYPTION_SECRET = process.env.LLM_GATEWAY_SECRET || 'default-dev-secret'

function tryDecrypt(text: string): string {
  if (!text) return text
  if (text.split(':').length === 3 && text.length > 40) {
    try { return decrypt(text, ENCRYPTION_SECRET) } catch { /* not actually encrypted */ }
  }
  return text
}
```

将 `rowToProvider` 函数（第 55-67 行）中的：
```typescript
apiKey: tryDecrypt(row.api_key_encrypted as string),
```
改为：
```typescript
apiKey: row.api_key as string,
```

将 `createProvider` 函数（第 69-83 行）中的：
```typescript
INSERT INTO providers (name, provider_type, base_url, api_key_encrypted, models)
VALUES (@name, @providerType, @baseUrl, @apiKeyEncrypted, @models)
```
改为：
```typescript
INSERT INTO providers (name, provider_type, base_url, api_key, models)
VALUES (@name, @providerType, @baseUrl, @apiKey, @models)
```

将参数 `apiKeyEncrypted` 改为 `apiKey`：
```typescript
apiKey: input.apiKey,
```

- [ ] **Step 2: 确认无 crypto 残留**

```bash
grep -n "decrypt\|tryDecrypt\|ENCRYPTION_SECRET\|api_key_encrypted\|apiKeyEncrypted" src/main/db/providers.ts || echo "CLEAN"
```

期望输出: `CLEAN`

- [ ] **Step 3: 提交**

```bash
git add src/main/db/providers.ts
git commit -m "refactor: providers 移除 tryDecrypt，列重命名为 api_key"
```

### Task 2.5: 创建 server/index.ts（Hono app 工厂）

**Files:**
- Create: `src/main/server/index.ts`

- [ ] **Step 1: 创建 Hono app 生命周期管理**

创建 `src/main/server/index.ts`：

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerRoutes } from './routes'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'

export function createApp() {
  const app = new Hono()

  app.use('*', cors())

  registerRoutes(app)

  return app
}

export function startServer(port: number = 8080): Server {
  const app = createApp()
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
  return server as unknown as Server
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/server/index.ts
git commit -m "feat: 创建 Hono app 工厂 server/index.ts"
```

### Task 2.6: 创建 server/middleware/auth.ts

**Files:**
- Create: `src/main/server/middleware/auth.ts`
- Test: `src/main/server/middleware/__tests__/auth.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/main/server/middleware/__tests__/auth.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { createAuthMiddleware } from '../auth'

// Mock verifyApiKey
vi.mock('../../../db/api-keys', () => ({
  verifyApiKey: vi.fn((key: string) => {
    if (key === 'sk-valid-test-key') return { id: 1, name: 'test-key', rate_limit: 60, key_prefix: 'sk-valid', is_active: 1, created_at: '' }
    return null
  })
}))

describe('auth middleware', () => {
  it('无 Authorization header 返回 401', async () => {
    const app = new Hono()
    app.use('/v1/*', createAuthMiddleware())
    app.get('/v1/test', (c) => c.text('ok'))

    const res = await app.request('/v1/test')
    expect(res.status).toBe(401)
  })

  it('有效 API key 通过并设置 context', async () => {
    const app = new Hono()
    app.use('/v1/*', createAuthMiddleware())
    app.get('/v1/test', (c) => {
      const key = c.get('apiKey')
      return c.json(key)
    })

    const res = await app.request('/v1/test', {
      headers: { Authorization: 'Bearer sk-valid-test-key' }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/main/server/middleware/__tests__/auth.test.ts
```

期望：FAIL

- [ ] **Step 3: 实现 auth middleware**

创建 `src/main/server/middleware/auth.ts`：

```typescript
import type { MiddlewareHandler } from 'hono'
import { verifyApiKey } from '../../db/api-keys'

export function createAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401)
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader

    const key = verifyApiKey(token)
    if (!key) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    c.set('apiKey', key)
    await next()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/main/server/middleware/__tests__/auth.test.ts
```

期望：2 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/server/middleware/auth.ts src/main/server/middleware/__tests__/auth.test.ts
git commit -m "feat: 创建认证中间件 server/middleware/auth.ts"
```

### Task 2.7: 创建 server/middleware/rate-limit.ts + server/routes.ts

**Files:**
- Create: `src/main/server/middleware/rate-limit.ts`
- Create: `src/main/server/routes.ts`

- [ ] **Step 1: 创建 rate-limit.ts**

```typescript
import type { MiddlewareHandler } from 'hono'

interface RateEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(maxPerMinute: number = 60): MiddlewareHandler {
  const store = new Map<string, RateEntry>()

  return async (c, next) => {
    const key = c.get('apiKey') as { id: number; name: string } | undefined
    const clientId = key?.name ?? c.req.header('x-forwarded-for') ?? 'unknown'
    const now = Date.now()

    let entry = store.get(clientId)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 }
      store.set(clientId, entry)
    }

    entry.count++
    if (entry.count > maxPerMinute) {
      return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }, 429)
    }

    await next()
  }
}
```

- [ ] **Step 2: 创建 routes.ts（骨架，后续 Phase 逐步填充）**

```typescript
import type { Hono } from 'hono'

export function registerRoutes(_app: Hono): void {
  // 各 domain router 将在后续 Phase 注册
  // app.route('/v1/admin/providers', createProviderRouter(service))
  // app.route('/v1/admin/api-keys', createApiKeyRouter(service))
  // ...
}
```

- [ ] **Step 3: 提交**

```bash
git add src/main/server/middleware/rate-limit.ts src/main/server/routes.ts
git commit -m "feat: 创建 rate-limit 中间件 + routes 骨架"
```

---

## Phase 3: Domain 迁移 — Provider

### Task 3.1: 创建 provider domain（service + router + types）

**Files:**
- Create: `src/main/domains/provider/provider.types.ts`
- Create: `src/main/domains/provider/provider.service.ts`
- Create: `src/main/domains/provider/provider.router.ts`
- Test: `src/main/domains/provider/__tests__/provider.service.test.ts`
- Test: `src/main/domains/provider/__tests__/provider.router.test.ts`

- [ ] **Step 1: 创建 provider.types.ts**

```typescript
export interface ProviderRow {
  id: number
  name: string
  provider_type: 'anthropic' | 'openai'
  base_url: string
  api_key: string
  models: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface ProviderResponse {
  id: number
  name: string
  providerType: string
  baseUrl: string
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface CreateProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface UpdateProviderInput {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: number
}
```

- [ ] **Step 2: 写 service 失败测试**

创建 `src/main/domains/provider/__tests__/provider.service.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, getDb } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderService } from '../provider.service'

describe('createProviderService', () => {
  beforeAll(async () => {
    initDb(':memory:')
    createTables()
  })

  afterAll(() => {
    getDb().close()
  })

  it('list 返回空数组当无 provider', async () => {
    const service = createProviderService(getDb())
    const result = await service.list()
    expect(result).toEqual([])
  })

  it('create 创建新 provider 并返回 id', async () => {
    const service = createProviderService(getDb())
    const id = await service.create({
      name: 'Test Provider',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4']
    })
    expect(typeof id).toBe('number')
  })

  it('list 返回创建的 provider', async () => {
    const service = createProviderService(getDb())
    const items = await service.list()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Test Provider')
    expect(items[0].models).toEqual(['gpt-4'])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx vitest run src/main/domains/provider/__tests__/provider.service.test.ts
```

期望：FAIL

- [ ] **Step 4: 实现 provider.service.ts**

创建 `src/main/domains/provider/provider.service.ts`：

```typescript
import type { Database } from '../../db/connection'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'

export function createProviderService(db: Database) {
  return {
    list: async (): Promise<ProviderResponse[]> => {
      const rows = db.prepare(
        'SELECT * FROM providers ORDER BY created_at DESC'
      ).all() as Record<string, unknown>[]

      return rows.map(rowToResponse)
    },

    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row) return undefined
      return rowToResponse(row)
    },

    create: async (input: CreateProviderInput): Promise<number> => {
      const stmt = db.prepare(`
        INSERT INTO providers (name, provider_type, base_url, api_key, models)
        VALUES (@name, @providerType, @baseUrl, @apiKey, @models)
      `)
      const result = stmt.run({
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        models: JSON.stringify(input.models)
      })
      return Number(result.lastInsertRowid)
    },

    update: async (id: number, input: UpdateProviderInput): Promise<void> => {
      const columnMap: Record<string, string> = {
        name: 'name', providerType: 'provider_type', baseUrl: 'base_url',
        apiKey: 'api_key', models: 'models', isActive: 'is_active'
      }
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      for (const [key, value] of Object.entries(input)) {
        const col = columnMap[key]
        if (!col) continue
        params[col] = key === 'models' ? JSON.stringify(value) : value
        setClauses.push(`${col} = @${col}`)
      }

      if (setClauses.length === 0) return
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    remove: async (id: number): Promise<void> => {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    }
  }
}

function rowToResponse(row: Record<string, unknown>): ProviderResponse {
  return {
    id: row.id as number,
    name: row.name as string,
    providerType: row.provider_type as string,
    baseUrl: row.base_url as string,
    models: JSON.parse(row.models as string) as string[],
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
```

- [ ] **Step 5: 运行 service 测试确认通过**

```bash
npx vitest run src/main/domains/provider/__tests__/provider.service.test.ts
```

期望：3 tests PASS

- [ ] **Step 6: 写 router 失败测试**

创建 `src/main/domains/provider/__tests__/provider.router.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { initDb, getDb } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderService } from '../provider.service'
import { createProviderRouter } from '../provider.router'

describe('createProviderRouter', () => {
  let app: Hono

  beforeAll(() => {
    initDb(':memory:')
    createTables()
    const service = createProviderService(getDb())
    app = new Hono()
    app.route('/v1/admin/providers', createProviderRouter(service))
  })

  afterAll(() => { getDb().close() })

  it('GET / 返回空列表', async () => {
    const res = await app.request('/v1/admin/providers')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST / 创建 provider 返回 201', async () => {
    const res = await app.request('/v1/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OpenAI', providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-key', models: ['gpt-4']
      })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('OpenAI')
  })
})
```

- [ ] **Step 7: 运行 router 测试确认失败**

```bash
npx vitest run src/main/domains/provider/__tests__/provider.router.test.ts
```

期望：FAIL

- [ ] **Step 8: 实现 provider.router.ts（≤40 行）**

创建 `src/main/domains/provider/provider.router.ts`：

```typescript
import { Hono } from 'hono'
import type { ProviderService } from './provider.service'

export function createProviderRouter(service: ProviderService) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const item = await service.getById(id)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const id = await service.create(body)
    const item = await service.getById(id)
    return c.json(item, 201)
  })

  router.put('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    await service.update(id, body)
    return c.json({ success: true })
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  return router
}
```

- [ ] **Step 9: 运行 router 测试确认通过**

```bash
npx vitest run src/main/domains/provider/__tests__/provider.router.test.ts
```

期望：2 tests PASS

- [ ] **Step 10: 注册路由到 server/routes.ts**

更新 `src/main/server/routes.ts`：

```typescript
import type { Hono } from 'hono'
import { getDb } from '../core/database'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderRouter } from '../domains/provider/provider.router'

export function registerRoutes(app: Hono): void {
  const db = getDb()
  const providerService = createProviderService(db)
  app.route('/v1/admin/providers', createProviderRouter(providerService))
}
```

- [ ] **Step 11: 提交**

```bash
git add src/main/domains/provider/ src/main/server/routes.ts
git commit -m "feat: 迁移 provider domain — service + router + 测试"
```

---

## Phase 4: Domain 迁移 — 其余 5 个 domain

### Task 4.1: 迁移 apikey domain

**Files:**
- Create: `src/main/domains/apikey/apikey.types.ts`
- Create: `src/main/domains/apikey/apikey.service.ts`
- Create: `src/main/domains/apikey/apikey.router.ts`
- Test: `src/main/domains/apikey/__tests__/apikey.service.test.ts`
- Test: `src/main/domains/apikey/__tests__/apikey.router.test.ts`
- Modify: `src/main/server/routes.ts`

**说明:** 此 domain 对应 `src/main/db/api-keys.ts` 的 CRUD。Hono route 负责 HTTP API；IPC 仍保留 list/create/delete 用于 bootstrap。

- [ ] **Step 1: 创建 apikey.types.ts**

```typescript
export interface ApiKeyResponse {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface CreateApiKeyInput {
  name: string
  rateLimit?: number
}
```

- [ ] **Step 2: 创建 apikey.service.ts（封装 db/api-keys.ts 现有函数）**

```typescript
import type { Database } from '../../db/connection'
import type { ApiKeyResponse, CreateApiKeyInput } from './apikey.types'
import { listApiKeys, createApiKey, deleteApiKey, getApiKeyById } from '../../db/api-keys'

export function createApiKeyService(_db: Database) {
  return {
    list: async (): Promise<ApiKeyResponse[]> => {
      return listApiKeys()
    },

    getById: async (id: number) => {
      return getApiKeyById(id)
    },

    create: async (input: CreateApiKeyInput) => {
      return createApiKey(input.name, input.rateLimit ?? 60)
    },

    remove: async (id: number): Promise<void> => {
      deleteApiKey(id)
    }
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
```

- [ ] **Step 3: 创建 apikey.router.ts**

```typescript
import { Hono } from 'hono'
import type { ApiKeyService } from './apikey.service'

export function createApiKeyRouter(service: ApiKeyService) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const result = await service.create(body)
    return c.json(result, 201)
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  return router
}
```

- [ ] **Step 4: 更新 server/routes.ts 注册 apikey 路由**

在 `registerRoutes` 函数中添加：

```typescript
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createApiKeyRouter } from '../domains/apikey/apikey.router'

// 在 registerRoutes 函数内添加：
const apiKeyService = createApiKeyService(db)
app.route('/v1/admin/api-keys', createApiKeyRouter(apiKeyService))
```

- [ ] **Step 5: 提交**

```bash
git add src/main/domains/apikey/ src/main/server/routes.ts
git commit -m "feat: 迁移 apikey domain — service + router"
```

### Task 4.2: 迁移 conversation domain

**Files:**
- Create: `src/main/domains/conversation/conversation.types.ts`
- Create: `src/main/domains/conversation/conversation.service.ts`
- Create: `src/main/domains/conversation/conversation.router.ts`
- Test: `src/main/domains/conversation/__tests__/conversation.service.test.ts`
- Modify: `src/main/server/routes.ts`

- [ ] **Step 1: 创建 conversation.types.ts**

```typescript
export interface ConversationResponse {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface MessageResponse {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

export interface CreateConversationInput {
  title: string
  model: string
  providerId?: number | null
  apiKeyId?: number | null
}

export interface UpdateConversationInput {
  title?: string
  provider_id?: number | null
  model?: string
  api_key_id?: number | null
}

export interface AddMessageInput {
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}
```

- [ ] **Step 2: 创建 conversation.service.ts（封装 db/conversations.ts）**

```typescript
import type { Database } from '../../db/connection'
import type {
  ConversationResponse, MessageResponse,
  CreateConversationInput, UpdateConversationInput, AddMessageInput
} from './conversation.types'

export function createConversationService(db: Database) {
  return {
    list: async (): Promise<ConversationResponse[]> => {
      return db.prepare(
        'SELECT * FROM conversations ORDER BY updated_at DESC'
      ).all() as ConversationResponse[]
    },

    getById: async (id: number): Promise<ConversationResponse | undefined> => {
      return db.prepare(
        'SELECT * FROM conversations WHERE id = ?'
      ).get(id) as ConversationResponse | undefined
    },

    create: async (input: CreateConversationInput): Promise<number> => {
      const result = db.prepare(`
        INSERT INTO conversations (title, model, provider_id, api_key_id)
        VALUES (@title, @model, @providerId, @apiKeyId)
      `).run({
        title: input.title,
        model: input.model,
        providerId: input.providerId ?? null,
        apiKeyId: input.apiKeyId ?? null
      })
      return Number(result.lastInsertRowid)
    },

    update: async (id: number, input: UpdateConversationInput): Promise<void> => {
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      const fieldMap: Record<string, string> = {
        title: 'title', model: 'model',
        provider_id: 'provider_id', api_key_id: 'api_key_id'
      }
      for (const [key, value] of Object.entries(input)) {
        const col = fieldMap[key]
        if (!col || value === undefined) continue
        params[col] = value
        setClauses.push(`${col} = @${col}`)
      }

      if (setClauses.length === 0) return
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE conversations SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    remove: async (id: number): Promise<void> => {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },

    messages: async (conversationId: number): Promise<MessageResponse[]> => {
      return db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).all(conversationId) as MessageResponse[]
    },

    addMessage: async (input: AddMessageInput): Promise<number> => {
      const result = db.prepare(`
        INSERT INTO messages (conversation_id, role, content, thinking)
        VALUES (@conversationId, @role, @content, @thinking)
      `).run({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        thinking: input.thinking || ''
      })
      return Number(result.lastInsertRowid)
    }
  }
}

export type ConversationService = ReturnType<typeof createConversationService>
```

- [ ] **Step 3: 创建 conversation.router.ts**

```typescript
import { Hono } from 'hono'
import type { ConversationService } from './conversation.service'

export function createConversationRouter(service: ConversationService) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const item = await service.getById(id)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const id = await service.create(body)
    const item = await service.getById(id)
    return c.json(item, 201)
  })

  router.put('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.update(id, await c.req.json())
    return c.json({ success: true })
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  router.get('/:id/messages', async (c) => {
    const id = Number(c.req.param('id'))
    const msgs = await service.messages(id)
    return c.json(msgs)
  })

  router.post('/:id/messages', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const msgId = await service.addMessage({
      conversationId: id,
      role: body.role,
      content: body.content,
      thinking: body.thinking
    })
    return c.json({ id: msgId }, 201)
  })

  return router
}
```

- [ ] **Step 4: 更新 server/routes.ts**

```typescript
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationRouter } from '../domains/conversation/conversation.router'

const conversationService = createConversationService(db)
app.route('/v1/admin/conversations', createConversationRouter(conversationService))
```

- [ ] **Step 5: 提交**

```bash
git add src/main/domains/conversation/ src/main/server/routes.ts
git commit -m "feat: 迁移 conversation domain — service + router"
```

### Task 4.3: 迁移 logs domain

**Files:**
- Create: `src/main/domains/logs/logs.types.ts`
- Create: `src/main/domains/logs/logs.service.ts`
- Create: `src/main/domains/logs/logs.router.ts`
- Modify: `src/main/server/routes.ts`

- [ ] **Step 1: 创建 logs.service.ts（封装 db/logs.ts 现有函数）**

```typescript
import type { Database } from '../../db/connection'
import { queryLogs, getLogStats, getDetailedStats } from '../../db/logs'
import { listProviders } from '../../db/providers'

export function createLogsService(_db: Database) {
  return {
    query: async (params: Record<string, unknown>) => {
      return queryLogs(params)
    },

    stats: async (range: string) => {
      return getLogStats({ range })
    },

    detailedStats: async (range: '24h' | '30d') => {
      // Replicate the aggregation logic from ipc/index.ts logs:statsDetailed handler
      const rows = getDetailedStats(range) as {
        provider_id: number; model: string;
        total_requests: number; total_tokens_in: number;
        total_tokens_out: number; total_errors: number;
        period: number | string
      }[]
      const providers = listProviders()

      const providerMap = new Map<number, {
        providerId: number; providerName: string;
        models: Map<string, {
          model: string; totalRequests: number;
          totalTokensIn: number; totalTokensOut: number;
          totalErrors: number;
          dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[]
        }>
      }>()

      for (const row of rows) {
        const pid = row.provider_id
        const model = row.model
        if (!providerMap.has(pid)) {
          const p = providers.find((pr) => pr.id === pid)
          providerMap.set(pid, {
            providerId: pid,
            providerName: p?.name ?? `Provider #${pid}`,
            models: new Map()
          })
        }
        const pm = providerMap.get(pid)!
        if (!pm.models.has(model)) {
          pm.models.set(model, {
            model,
            totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, totalErrors: 0,
            dataPoints: []
          })
        }
        const mm = pm.models.get(model)!
        mm.totalRequests += row.total_requests
        mm.totalTokensIn += row.total_tokens_in
        mm.totalTokensOut += row.total_tokens_out
        mm.totalErrors += row.total_errors
        mm.dataPoints.push({
          period: row.period,
          requests: row.total_requests,
          tokensIn: row.total_tokens_in,
          tokensOut: row.total_tokens_out
        })
      }

      return Array.from(providerMap.values()).map((p) => ({
        providerId: p.providerId,
        providerName: p.providerName,
        models: Array.from(p.models.values()).map((m) => ({
          model: m.model,
          totalRequests: m.totalRequests,
          totalTokensIn: m.totalTokensIn,
          totalTokensOut: m.totalTokensOut,
          totalErrors: m.totalErrors,
          dataPoints: m.dataPoints
        }))
      }))
    }
  }
}

export type LogsService = ReturnType<typeof createLogsService>
```

- [ ] **Step 2: 创建 logs.router.ts**

```typescript
import { Hono } from 'hono'
import type { LogsService } from './logs.service'

export function createLogsRouter(service: LogsService) {
  const router = new Hono()

  router.get('/query', async (c) => {
    const params = Object.fromEntries(new URL(c.req.url).searchParams)
    return c.json(await service.query(params))
  })

  router.get('/stats', async (c) => {
    const range = new URL(c.req.url).searchParams.get('range') || '24h'
    return c.json(await service.stats(range))
  })

  router.get('/stats-detailed', async (c) => {
    const range = (new URL(c.req.url).searchParams.get('range') || '24h') as '24h' | '30d'
    return c.json(await service.detailedStats(range))
  })

  return router
}
```

- [ ] **Step 3: 更新 server/routes.ts**

```typescript
import { createLogsService } from '../domains/logs/logs.service'
import { createLogsRouter } from '../domains/logs/logs.router'

const logsService = createLogsService(db)
app.route('/v1/admin/logs', createLogsRouter(logsService))
```

- [ ] **Step 4: 提交**

```bash
git add src/main/domains/logs/ src/main/server/routes.ts
git commit -m "feat: 迁移 logs domain — service + router"
```

### Task 4.4: 创建 stats domain

**Files:**
- Create: `src/main/domains/stats/stats.service.ts`
- Create: `src/main/domains/stats/stats.router.ts`
- Modify: `src/main/server/routes.ts`

- [ ] **Step 1: 创建 stats.service.ts**

stats 的数据与 logs 共享，直接复用 `createLogsService` 的 `detailedStats`。创建薄封装：

```typescript
import type { Database } from '../../db/connection'
import { getLogStats } from '../../db/logs'

export function createStatsService(_db: Database) {
  return {
    summary: async (range: string) => {
      return getLogStats({ range })
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
```

- [ ] **Step 2: 创建 stats.router.ts**

```typescript
import { Hono } from 'hono'
import type { StatsService } from './stats.service'

export function createStatsRouter(service: StatsService) {
  const router = new Hono()

  router.get('/summary', async (c) => {
    const range = new URL(c.req.url).searchParams.get('range') || '24h'
    return c.json(await service.summary(range))
  })

  return router
}
```

- [ ] **Step 3: 更新 server/routes.ts**

```typescript
import { createStatsService } from '../domains/stats/stats.service'
import { createStatsRouter } from '../domains/stats/stats.router'

const statsService = createStatsService(db)
app.route('/v1/admin/stats', createStatsRouter(statsService))
```

- [ ] **Step 4: 提交**

```bash
git add src/main/domains/stats/ src/main/server/routes.ts
git commit -m "feat: 创建 stats domain — service + router"
```

### Task 4.5: 创建 chat domain + 更新 converter.ts

**Files:**
- Create: `src/main/domains/chat/chat.types.ts`
- Create: `src/main/domains/chat/chat.service.ts`
- Create: `src/main/domains/chat/chat.router.ts`
- Modify: `src/main/proxy/converter.ts`
- Modify: `src/main/server/routes.ts`

- [ ] **Step 1: 创建 chat.types.ts**

```typescript
export interface ChatRequest {
  model: string
  messages: { role: string; content: string }[]
  stream?: boolean
}

export interface ChatChunk {
  text: string
  chunkType?: 'thinking' | 'text'
  done: boolean
  error?: string
}
```

- [ ] **Step 2: 创建 chat.service.ts**

```typescript
import { resolveProvider } from '../../proxy/router'
import { buildProxyUrl, buildProxyHeaders } from '../../proxy/forwarder'
import { convertSSEEvent, createStreamContext } from '../../proxy/converter'
import { getApiKeyPlaintext, verifyApiKey } from '../../db/api-keys'
import { createLogger } from '../../core/logger'

const logger = createLogger('chat.service')

export function createChatService() {
  return {
    send: async function* (
      model: string,
      messages: { role: string; content: string }[],
      gatewayApiKey: string
    ): AsyncGenerator<{ text: string; chunkType?: 'thinking' | 'text'; done: boolean; error?: string }> {
      // 1. Verify gateway API key to get provider API key
      const keyRecord = verifyApiKey(gatewayApiKey)
      if (!keyRecord) {
        yield { text: 'Invalid gateway API key', done: true, error: 'Unauthorized' }
        return
      }
      const providerApiKey = getApiKeyPlaintext(keyRecord.id)
      if (!providerApiKey) {
        yield { text: 'Provider API key not found', done: true, error: 'Internal error' }
        return
      }

      // 2. Resolve provider
      const resolved = resolveProvider(model)
      if (!resolved) {
        yield { text: `Unknown model: ${model}`, done: true, error: 'Invalid model' }
        return
      }

      // 3. Build upstream request
      const path = resolved.provider.providerType === 'anthropic'
        ? '/v1/messages' : '/v1/chat/completions'
      const url = buildProxyUrl(resolved.provider, path)
      const headers = buildProxyHeaders(resolved.provider, providerApiKey)

      // 4. Send stream request
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: resolved.model,
          messages,
          stream: true
        })
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        yield { text: `Proxy returned ${response.status}: ${errBody}`, done: true, error: 'Upstream error' }
        return
      }

      // 5. Read SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        yield { text: 'Response body is not readable', done: true, error: 'No body' }
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      const streamCtx = createStreamContext(resolved.provider.providerType)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith(':')) continue

            const event = convertSSEEvent(trimmed, streamCtx)
            if (event) {
              yield { text: event.text, chunkType: event.chunkType, done: false }
            }
          }
        }
        yield { text: '', done: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Chat stream error', { error: message })
        yield { text: message, done: true, error: message }
      }
    }
  }
}

export type ChatService = ReturnType<typeof createChatService>
```

- [ ] **Step 3: 更新 converter.ts（移除 debugInfo 闭包依赖）**

在 converter.ts 中确保 `convertSSEEvent` 是纯函数，不接受闭包捕获的 `debugInfo`。如果当前 converter.ts 有 `debugInfo` 闭包，将其改为参数传递或移除。

检查当前 converter.ts：

```bash
grep -n "debugInfo\|debugFileLog\|debug_info" src/main/proxy/converter.ts || echo "NO_DEBUGINFO"
```

如果存在 debugInfo 引用，将其移除，改为调用 `createLogger('proxy.converter')`。

- [ ] **Step 4: 创建 chat.router.ts**

```typescript
import { Hono } from 'hono'
import type { ChatService } from './chat.service'

export function createChatRouter(service: ChatService) {
  const router = new Hono()

  router.post('/completions', async (c) => {
    const body = await c.req.json()
    const { model, messages, stream = false } = body
    const authHeader = c.req.header('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    if (!stream) {
      // 非流式：暂时返回错误，后续可扩展
      return c.json({ error: 'Non-streaming not yet supported' }, 501)
    }

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of service.send(model, messages, token)) {
            const data = JSON.stringify(chunk)
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            if (chunk.done) {
              controller.close()
              return
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: message, done: true, error: message })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  })

  return router
}
```

- [ ] **Step 5: 更新 server/routes.ts**

```typescript
import { createChatService } from '../domains/chat/chat.service'
import { createChatRouter } from '../domains/chat/chat.router'

const chatService = createChatService()
app.route('/v1/chat', createChatRouter(chatService))
```

- [ ] **Step 6: 提交**

```bash
git add src/main/domains/chat/ src/main/proxy/converter.ts src/main/server/routes.ts
git commit -m "feat: 迁移 chat domain — service + router + converter 解耦"
```

---

## Phase 5: SSE 重写 — Renderer 直连 Hono

### Task 5.1: 创建 shared/lib/api-client.ts（统一 HTTP 封装）

**Files:**
- Create: `src/renderer/shared/lib/api-client.ts`

- [ ] **Step 1: 创建 api-client.ts**

```typescript
let baseUrl = 'http://localhost:8080'
let apiKey = ''

export function setApiBaseUrl(url: string) {
  baseUrl = url
}

export function setApiKey(key: string) {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => { headers[key] = value })
    } else {
      Object.assign(headers, init.headers)
    }
  }

  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  })
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/shared/lib/api-client.ts
git commit -m "feat: 创建统一 HTTP 封装 api-client.ts"
```

### Task 5.2: 创建 useChatStream hook（原生 ReadableStream 消费 SSE）

**Files:**
- Create: `src/renderer/features/chat/hooks/useChatStream.ts`

- [ ] **Step 1: 创建 useChatStream.ts**

```typescript
import { useState, useRef, useCallback } from 'react'
import { apiFetch, getApiKey } from '@/shared/lib/api-client'

interface StreamMessage {
  id: string
  role: 'assistant'
  content: string
  thinking?: string
  isThinking: boolean
  isStreaming: boolean
  error: boolean
}

interface UseChatStreamReturn {
  send: (model: string, providerType: 'anthropic' | 'openai', messages: { role: string; content: string }[]) => Promise<void>
  abort: () => void
  message: StreamMessage | null
  isLoading: boolean
  error: string | null
}

export function useChatStream(onUpdate: (msg: StreamMessage) => void): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messageRef = useRef<StreamMessage | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
  }, [])

  const send = useCallback(async (
    model: string,
    providerType: 'anthropic' | 'openai',
    messages: { role: string; content: string }[]
  ) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('No API key configured')
      return
    }

    const abortController = new AbortController()
    abortRef.current = abortController
    setIsLoading(true)
    setError(null)

    const msgId = crypto.randomUUID()
    const initialMsg: StreamMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      thinking: '',
      isThinking: true,
      isStreaming: true,
      error: false,
    }
    messageRef.current = initialMsg
    onUpdate(initialMsg)

    try {
      const response = await apiFetch('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model, messages, stream: true }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        const errorMsg: StreamMessage = {
          ...messageRef.current!,
          content: `Error ${response.status}: ${errorText}`,
          isStreaming: false,
          isThinking: false,
          error: true,
        }
        messageRef.current = errorMsg
        onUpdate(errorMsg)
        setError(errorText)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let contentAcc = ''
      let thinkingAcc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.done) {
              const doneMsg: StreamMessage = {
                ...messageRef.current!,
                content: contentAcc,
                thinking: thinkingAcc,
                isStreaming: false,
                isThinking: false,
              }
              messageRef.current = doneMsg
              onUpdate(doneMsg)
              return
            }

            if (parsed.chunkType === 'thinking') {
              thinkingAcc += parsed.text
            } else {
              contentAcc += parsed.text || ''
            }

            const updatedMsg: StreamMessage = {
              ...messageRef.current!,
              content: contentAcc,
              thinking: thinkingAcc,
              isThinking: parsed.chunkType === 'thinking',
            }
            messageRef.current = updatedMsg
            onUpdate(updatedMsg)
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      if (messageRef.current) {
        const errorMsg: StreamMessage = {
          ...messageRef.current,
          content: message,
          isStreaming: false,
          isThinking: false,
          error: true,
        }
        messageRef.current = errorMsg
        onUpdate(errorMsg)
      }
    } finally {
      abortRef.current = null
      setIsLoading(false)
    }
  }, [onUpdate])

  return { send, abort, message: messageRef.current, isLoading, error }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/features/chat/hooks/useChatStream.ts
git commit -m "feat: 创建 useChatStream — 原生 ReadableStream 消费 SSE"
```

### Task 5.3: 更新 Chat.tsx 使用 api-client.ts + useChatStream

**Files:**
- Modify: `src/renderer/pages/Chat.tsx`

- [ ] **Step 1: 更新 Chat.tsx 的 send 逻辑**

将 Chat.tsx 中 `handleSend` 函数的：

```typescript
api.chat.send({
  requestId,
  apiKeyId: selectedApiKeyId,
  model: `${selectedProvider.name}/${selectedModel}`,
  messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content }],
  apiFormat: selectedProvider.providerType,
})
```

替换为对 `useChatStream` 的调用，并移除对 `api.chat.onChunk` 的依赖。

**关键改动：**
1. 导入 `useChatStream` 替代 `useEffect(api.chat.onChunk)`
2. `handleSend` 改为调用 `send(model, providerType, messages)`
3. `handleStop` 改为调用 `abort()`
4. 删除 `chunkCountRef`, `accumulatedContent`, `accumulatedThinking`, `currentRequestId` 等手动流管理
5. 保留消息数组、inputKey 等 UI 状态

具体代码见完整实现。（此任务行数较多，由子代理根据 spec 第 6.1 节的数据流图实现）

- [ ] **Step 2: 提交**

```bash
git add src/renderer/pages/Chat.tsx
git commit -m "refactor: Chat.tsx 切换为 useChatStream + apiFetch 直连 Hono"
```

### Task 5.4: 删除 ipc/index.ts 中的 chat:send 和 chat:abort handler

**Files:**
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: 移除 chat handler**

删除 `src/main/ipc/index.ts` 的第 210-363 行（`// --- Chat handlers ---` 及其下全部代码）。

删除 `const DEBUG_LOG`（第 31 行）和 `debugFileLog` 函数（第 33-39 行），替换为 `createLogger` 导入。

- [ ] **Step 2: 提交**

```bash
git add src/main/ipc/index.ts
git commit -m "refactor: 移除 ipc Chat handler — 已迁移到 Hono chat.router"
```

---

## Phase 6: Renderer 完整迁移

### Task 6.1: 创建 shared/lib/ipc.ts（薄封装）

**Files:**
- Create: `src/renderer/shared/lib/ipc.ts`

- [ ] **Step 1: 创建 ipc.ts**

```typescript
export const api = typeof window !== 'undefined' && 'electronAPI' in window
  ? (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI
  : undefined

export function getApi(): typeof api {
  return api
}
```

- [ ] **Step 2: 更新 queries 导入路径**

将所有 queries 文件的 `import { api } from '../ipc'` 改为：
```typescript
import { api } from '@/shared/lib/ipc'
```

涉及文件：
- `src/renderer/lib/queries/providers.ts`
- `src/renderer/lib/queries/stats.ts`
- `src/renderer/lib/queries/logs.ts`
- `src/renderer/lib/queries/apiKeys.ts`
- `src/renderer/lib/queries/conversations.ts`
- `src/renderer/lib/queries/update.ts`

- [ ] **Step 3: 提交**

```bash
git add src/renderer/shared/lib/ipc.ts src/renderer/lib/queries/
git commit -m "refactor: 创建 shared/lib/ipc.ts，更新 queries 导入"
```

### Task 6.2: 创建 app/ 路由布局

**Files:**
- Create: `src/renderer/app/router.tsx`
- Create: `src/renderer/app/Layout.tsx`
- Modify: `src/renderer/main.tsx`

- [ ] **Step 1: 创建 router.tsx**

```typescript
import { Routes, Route } from 'react-router-dom'
import { Layout } from './Layout'
import { ChatPage } from '../pages/Chat'
import { DashboardPage } from '../pages/Dashboard'
import { SettingsPage } from '../pages/Settings'

export function AppRouter() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ChatPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 2: 创建 Layout.tsx（从现有 TitleBar + 导航抽取）**

创建包含 TitleBar 和导航的布局组件。如果现有 Layout 在 `shared/components/Layout.tsx`，迁移内容到此。

- [ ] **Step 3: 更新 main.tsx 导入 AppRouter**

```typescript
import { AppRouter } from './app/router'

// 将渲染部分改为：
<HashRouter>
  <AppRouter />
</HashRouter>
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/app/ src/renderer/main.tsx
git commit -m "feat: 创建 app/ 路由布局 — router + Layout"
```

### Task 6.3: 重写 preload（壳能力 + apiKeys）

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 精简 preload**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  debug: {
    log: (...args: unknown[]) => ipcRenderer.send('renderer:log', args),
  },
  apiKeys: {
    list: () => ipcRenderer.invoke('apikey:list'),
    create: (name: string, rateLimit?: number) =>
      ipcRenderer.invoke('apikey:create', name, rateLimit),
    delete: (id: number) => ipcRenderer.invoke('apikey:delete', id)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    skipVersion: (version: string) => ipcRenderer.invoke('update:skip-version', version),
    getConfig: () => ipcRenderer.invoke('update:get-config'),
    setConfig: (config: unknown) => ipcRenderer.invoke('update:set-config', config),
    getCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
    onAvailable: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:download-progress', handler)
      return () => ipcRenderer.removeListener('update:download-progress', handler)
    },
    onDownloaded: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (callback: (error: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  }
})
```

- [ ] **Step 2: 更新 ipc/index.ts 移除已迁移到 Hono 的 handler**

从 `ipc/index.ts` 移除以下 handler（已通过 Hono route 提供）：
- provider:list/create/update/delete
- logs:query/stats/statsDetailed
- conversation:list/create/update/delete/get/messages/addMessage
- proxy:status/start/stop/restart/setPort/getDebugMode/setDebugMode（迁移到 proxy router）

保留：
- apikey:list/create/delete（bootstrap）
- window:minimize/maximize/close（壳能力）
- update:*（自动更新）
- renderer:log（调试日志）

- [ ] **Step 3: 提交**

```bash
git add src/preload/index.ts src/main/ipc/index.ts
git commit -m "refactor: 精简 preload 为壳能力+apiKeys，IPC 移除业务 CRUD handler"
```

---

## Phase 7: Markdown 渲染 — Shiki 集成

### Task 7.1: 安装 Shiki + 更新 markdown.tsx code 渲染

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/components/ui/markdown.tsx`

- [ ] **Step 1: 安装 shiki**

```bash
npm install shiki
```

- [ ] **Step 2: 创建 shiki 高亮辅助函数**

创建 `src/renderer/shared/lib/shiki.ts`：

```typescript
import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['dark-plus'],
      langs: ['typescript', 'javascript', 'python', 'json', 'bash']
    })
  }
  return highlighter
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  try {
    const h = await getHighlighter()
    return h.codeToHtml(code, {
      lang,
      theme: 'dark-plus'
    })
  } catch {
    // Fallback: 纯文本
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
```

- [ ] **Step 3: 更新 markdown.tsx 的 code 组件**

在 `src/renderer/components/ui/markdown.tsx` 中：

添加导入：
```typescript
import { useState, useEffect } from 'react'
import { highlightCode } from '@/shared/lib/shiki'
```

更新 `code` 组件（第 126-138 行）：
```typescript
code: ({ node, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')

  if (match?.[1] === 'mermaid' && enableMermaid && !isStreaming) {
    return <MermaidBlock code={String(children).replace(/\n$/, '')} />
  }

  // 流式时不高亮（与 Mermaid 模式一致）
  if (isStreaming || !match) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  return <CodeBlock lang={match[1]} code={String(children).replace(/\n$/, '')} />
},
```

添加 `CodeBlock` 组件（在 `Markdown` 之上）：
```typescript
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    highlightCode(code, lang).then(setHtml)
  }, [code, lang])

  if (!html) {
    return (
      <pre className="text-xs bg-muted/20 rounded p-3 overflow-auto">
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="my-3 rounded-lg overflow-hidden border border-border/50"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json src/renderer/shared/lib/shiki.ts src/renderer/components/ui/markdown.tsx
git commit -m "feat: 集成 Shiki 代码语法高亮替代 highlight.js"
```

---

## Phase 8: 验证 + 清理

### Task 8.1: 全量测试 + 编译 + Lint

- [ ] **Step 1: 运行全量测试**

```bash
npm test
```

记录失败数，分析是否与本次重构相关。

- [ ] **Step 2: 修复测试回归**

逐个修复因重构导致的测试失败：
- 导入路径更新
- 函数签名变更
- 移除的依赖（encrypt/tryDecrypt）

- [ ] **Step 3: 全量编译**

```bash
npm run build
```

确保 `electron-vite build` 成功。

- [ ] **Step 4: Lint 检查**

```bash
npm run lint
```

修复新引入的 lint 问题。

- [ ] **Step 5: grep 验证 SSE 只在 converter.ts 一处**

```bash
grep -r "event\.sender\.send\|chat:chunk\|data:.*\\[DONE\\]" src/main/ --include="*.ts" | grep -v converter.ts | grep -v "\.d\.ts" || echo "SSE_CLEAN"
```

期望：只有 converter.ts 包含 SSE 发送逻辑。

- [ ] **Step 6: grep 验证 ipc/index.ts 无 CRUD handler**

```bash
grep -c "ipcMain.handle" src/main/ipc/index.ts
```

期望：数字 ≤ 5（仅 apiKeys + update handler）。

- [ ] **Step 7: 提交**

```bash
git add -u
git commit -m "chore: 全量测试 + 编译 + Lint 通过，SSE 收敛验证"
```

### Task 8.2: 手动冒烟测试

- [ ] **Step 1: 启动 dev**

```bash
npm run dev
```

- [ ] **Step 2: 验证 Chat 流式消息**

在 Chat 页面发送消息，确认：
- 流式文字正常显示
- 停止按钮正常
- 消息保存到对话历史

- [ ] **Step 3: 验证 CRUD 页面**

在设置页面：
- 创建/编辑/删除 Provider
- 创建/删除 API Key
- 查看日志和统计

- [ ] **Step 4: 验证 Markdown 渲染**

发送包含代码块的 prompt，确认 Shiki 高亮正常。

---

## 验收检查清单

对照 spec 第 9 节：

- [ ] 1. `npm run dev` 启动成功，Chat 发送消息正常（流式+非流式）
- [ ] 2. 管理局域网设备访问 `http://host-ip:8080` 正常
- [ ] 3. `npm test` 全量测试通过或适配完成
- [ ] 4. `npm run build` 全量构建成功
- [ ] 5. `npm run lint` 无新增错误
- [ ] 6. 删除 `highlight.js`、`rehype-highlight`、`crypto.ts` 后无编译错误
- [ ] 7. SSE 解析逻辑只在 `proxy/converter.ts` 中存在（grep 验证）
- [ ] 8. `ipc/index.ts` 不再包含业务 CRUD handler（仅壳能力 + apiKeys）
- [ ] 9. 每个 domain 的 router 不超过 50 行
- [ ] 10. `.claude/rules/` 8 个文件全部就位且内容通过 Code Review
