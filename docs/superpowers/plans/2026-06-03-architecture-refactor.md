# 架构分层修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复架构分层违规：复活 domains/ 层（IPC → service → db）、消除重复代码、拆分上帝类、统一 SSE 解析、类型治理、增加输入验证、统一日志通道。

**Architecture:** IPC handler 全部委托到 domain service，domain service 通过注入的 Database 实例操作数据。proxy/converter/ 拆为 request.ts + response.ts + sse.ts + types.ts。shared/types.ts 统一核心实体定义。

**Tech Stack:** TypeScript 6.0, Zod (需安装), vitest, sql.js

---

## 文件变更总览

| Task | 新建 | 修改 | 测试 |
|------|------|------|------|
| A (复活 domains/) | — | `ipc/index.ts` | `ipc/__tests__/integration.test.ts` |
| B (消除重复) | — | `ipc/index.ts` | — (A 中已覆盖) |
| F (类型治理) | — | `shared/types.ts`, `preload/types.ts`, `renderer/lib/types.ts`, `db/providers.ts` | TSC 编译 |
| G (输入验证) | `domains/*/schema.ts` (3文件) | `ipc/index.ts` | `domains/*/__tests__/schema.test.ts` (3文件) |
| C (拆分 converter) | `proxy/converter/` (5文件) | 删除 `proxy/converter.ts` | 适配 `proxy/__tests__/converter.test.ts` |
| D (SSE 统一) | — | `ipc/sse-parser.ts`, `proxy/converter/sse.ts`, `shared/types.ts` | TSC 编译 |
| E (日志统一) | — | `core/logger.ts`, `proxy/server.ts` | `core/__tests__/logger.test.ts` |
| 验证 | — | — | 全量 TSC + vitest |

---

## 前置依赖

Zod 未安装在项目中，Task G 前必须先安装：

```bash
npm install zod
```

---

### Task 1: 模块 A — 复活 domains/ 层（Phase 1）

**依赖**: 无
**目标**: `ipc/index.ts` 全部 handler 委托到 domain service，不再直调 `db/` 函数

**Files:**
- Modify: `src/main/ipc/index.ts`
- Test: `src/main/ipc/__tests__/integration.test.ts`

**背景**: 当前 `ipc/index.ts` 直接 import `db/providers`、`db/api-keys`、`db/conversations`、`db/logs` 的函数。5 个 domain service 已实现但从未被生产代码调用。

- [ ] **Step 1: 确认现有测试通过（基线）**

Run: `npx vitest run src/main/ipc/__tests__/integration.test.ts`
Expected: 集成测试全部 PASS

- [ ] **Step 2: 重构 ipc/index.ts，导入 domain services**

将 `src/main/ipc/index.ts` 的 imports 从直接引用 `db/` 改为导入 domain service 工厂函数：

```typescript
/**
 * IPC 处理器注册模块
 *
 * 注册主进程所有 IPC handler，连接渲染进程请求与后端数据层。
 * 遵循 domain 模式：IPC handler 委托到 domain service，不直接调用 db/ 层。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db/connection'
import { createLogger } from '../core/logger'
import { createProviderService } from '../domains/provider/provider.service'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createLogsService } from '../domains/logs/logs.service'
import { createStatsService } from '../domains/stats/stats.service'
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'
import { UpdateManager } from '../update/manager'
import { setupUpdateIpcHandlers } from '../update/ipc'

const logger = createLogger('ipc')

export function setupIpcHandlers(updateManager: UpdateManager): void {
  // 通过 getDb() 注入数据库实例，创建所有 domain service
  const db = getDb()
  const providerService = createProviderService(db)
  const apiKeyService = createApiKeyService()
  const conversationService = createConversationService(db)
  const logsService = createLogsService()
  const statsService = createStatsService()

  // ====== 供应商 CRUD ======
  ipcMain.handle('provider:list', async () => {
    return providerService.list()
  })

  ipcMain.handle('provider:create', async (_event, data) => {
    return providerService.create(data)
  })

  ipcMain.handle('provider:update', async (_event, id: number, data) => {
    return providerService.update(id, data)
  })

  ipcMain.handle('provider:delete', async (_event, id: number) => {
    return providerService.remove(id)
  })

  // ====== API 密钥 CRUD ======
  ipcMain.handle('apikey:list', async () => {
    return apiKeyService.list()
  })

  ipcMain.handle('apikey:create', async (_event, name: string, rateLimit?: number) => {
    return apiKeyService.create({ name, rateLimit })
  })

  ipcMain.handle('apikey:delete', async (_event, id: number) => {
    return apiKeyService.remove(id)
  })

  // ====== 日志查询与统计 ======
  ipcMain.handle('logs:query', async (_event, params) => {
    return logsService.query(params)
  })

  ipcMain.handle('logs:stats', async (_event, range: string) => {
    return statsService.summary(range)
  })

  ipcMain.handle('logs:statsDetailed', async (_event, range: '24h' | '30d') => {
    return logsService.detailedStats(range)
  })

  // ====== 窗口控制 ======
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // ====== 代理控制 ======
  ipcMain.handle('proxy:status', async () => {
    return getProxyConfig()
  })

  ipcMain.handle('proxy:start', async (_event, port?: number) => {
    return startProxy(port)
  })

  ipcMain.handle('proxy:stop', async () => {
    stopProxy()
  })

  ipcMain.handle('proxy:restart', async (_event, port?: number) => {
    return restartProxy(port)
  })

  ipcMain.handle('proxy:setPort', async (_event, port: number) => {
    setProxyPort(port)
  })

  ipcMain.handle('proxy:getDebugMode', async () => {
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: boolean) => {
    setDebugMode(enabled)
  })

  // ====== 渲染进程调试日志转发 ======
  ipcMain.on('renderer:log', (_event, args: unknown[]) => {
    logger.debug('renderer', { args })
  })

  // ====== 对话 CRUD ======
  ipcMain.handle('conversation:list', async () => {
    return conversationService.list()
  })

  ipcMain.handle('conversation:create', async (_event, data: {
    title: string
    model: string
    providerId?: number | null
    apiKeyId?: number | null
  }) => {
    const id = await conversationService.create(data)
    return conversationService.getById(id)
  })

  ipcMain.handle('conversation:update', async (_event, id: number, data: {
    title?: string
    providerId?: number | null
    model?: string
    apiKeyId?: number | null
  }) => {
    return conversationService.update(id, data)
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    return conversationService.remove(id)
  })

  ipcMain.handle('conversation:get', async (_event, id: number) => {
    return conversationService.getById(id) || null
  })

  ipcMain.handle('conversation:messages', async (_event, conversationId: number) => {
    return conversationService.messages(conversationId)
  })

  ipcMain.handle('conversation:addMessage', async (_event, conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => {
    return conversationService.addMessage({ conversationId, role, content, thinking })
  })

  // ====== 自动更新 ======
  setupUpdateIpcHandlers(updateManager)
}
```

- [ ] **Step 3: 运行集成测试验证**

Run: `npx vitest run src/main/ipc/__tests__/integration.test.ts`
Expected: 所有测试 PASS（service 已在内部正确实现）

- [ ] **Step 4: 运行 TSC 检查**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 5: 验证 IPC 层不再直接 import db/ 函数**

Run: `bash -c "grep -n \"from '../db/\" src/main/ipc/index.ts | grep -v connection"`
Expected: 空输出（只保留 `db/connection` 的 `getDb` 引用）

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/index.ts
git commit -m "refactor: ipc/index.ts 委托到 domain service，复活 domains/ 层

IPC handler 不再直调 db/providers、db/api-keys、db/conversations、db/logs，
改为通过 domain service 工厂函数（注入 getDb()）委托调用。
provider/update handler 的 camelCase→snake_case 映射逻辑已由 service 层处理。"
```

---

### Task 2: 模块 B — 消除 detailedStats 重复（Phase 2，可并行于 F/G）

**依赖**: Task 1 (A)
**目标**: 删除 `ipc/index.ts` 中与 `logs.service.ts` 重复的 detailedStats 聚合逻辑

**Files:**
- Modify: `src/main/ipc/index.ts`（Task 1 已完成，当前已委托到 `logsService.detailedStats(range)`）

**说明**: Task 1 的实现中已将 `logs:statsDetailed` handler 改为 `return logsService.detailedStats(range)`，原有 65 行内联 Map 聚合代码已被删除。此模块为确认项。

- [ ] **Step 1: 验证重复已消除**

Run: `bash -c "grep -c 'providerMap' src/main/ipc/index.ts"`
Expected: `0`（Map 聚合代码已不在 ipc/index.ts 中）

Run: `bash -c "grep -c 'providerMap' src/main/domains/logs/logs.service.ts"`
Expected: `1`（聚合逻辑仅在 logs.service.ts 中存在）

- [ ] **Step 2: 运行测试确认**

Run: `npx vitest run src/main/ipc/__tests__/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/index.ts
git commit -m "refactor: 消除 detailedStats 聚合逻辑重复

IPC handler 委托到 logsService.detailedStats()，
删除 ipc/index.ts 中原有的 65 行内联 Map 嵌套聚合代码。"
```

---

### Task 3: 模块 F — 类型治理（Phase 2，可并行于 B/G）

**依赖**: Task 1 (A)
**目标**: 核心实体类型集中到 `shared/types.ts`，各层通过派生使用

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/main/db/providers.ts`

- [ ] **Step 1: 在 shared/types.ts 新增核心实体类型**

在 `src/shared/types.ts` 末尾追加：

```typescript
// ====== 核心实体类型（各层共享基础定义） ======

/** LLM 供应商实体（内部完整字段，含 apiKey） */
export interface ProviderEntity {
  id: number
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

/** Gateway API Key 实体 */
export interface ApiKeyEntity {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

/** 对话实体 */
export interface ConversationEntity {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 对话消息实体 */
export interface ConversationMessageEntity {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}
```

- [ ] **Step 2: 运行 TSC 验证新增类型无冲突**

Run: `npx tsc --noEmit`
Expected: 零错误（新类型与现有类型无冲突）

- [ ] **Step 3: 适配 preload/types.ts — 删除重复的 Provider/ApiKey 定义**

将 `src/preload/types.ts` 的 Provider 和 ApiKey 接口改为从 shared 派生：

```typescript
import type { ProviderEntity, ApiKeyEntity, UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig } from '../shared/types'
export type { UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig }

/** Provider 对外类型（preload 层与 db 层结构一致） */
export type Provider = ProviderEntity

/** API Key 对外类型 */
export type ApiKey = ApiKeyEntity

export interface LogEntry {
  id: number
  api_key_id: number | null
  provider_id: number | null
  model: string
  api_format: string
  status_code: number
  tokens_in: number
  tokens_out: number
  duration_ms: number
  error: string | null
  created_at: string
}

export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

export interface ElectronAPI {
  providers: {
    list: () => Promise<Provider[]>
    create: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) => Promise<number>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  apiKeys: {
    list: () => Promise<ApiKey[]>
    create: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string; key: ApiKey }>
    delete: (id: number) => Promise<void>
  }
  logs: {
    query: (params: { page: number; limit: number }) => Promise<{ logs: LogEntry[]; total: number }>
    stats: (range: string) => Promise<DashboardStats>
    statsDetailed: (range: '24h' | '30d') => Promise<{ providerId: number; providerName: string; models: { model: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalErrors: number; dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[] }[] }[]>
  }
  proxy: {
    status: () => Promise<{ port: number; running: boolean; url: string | null }>
    start: (port?: number) => Promise<boolean>
    stop: () => Promise<void>
    restart: (port?: number) => Promise<boolean>
    setPort: (port: number) => Promise<void>
    getDebugMode: () => Promise<boolean>
    setDebugMode: (enabled: boolean) => Promise<void>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  update: {
    check: () => Promise<UpdateCheckResult>
    download: () => Promise<void>
    install: () => Promise<void>
    skipVersion: (version: string) => Promise<void>
    getConfig: () => Promise<UpdateConfig>
    setConfig: (config: Partial<UpdateConfig>) => Promise<void>
    getCurrentVersion: () => Promise<string>
    onAvailable: (callback: (info: UpdateInfo) => void) => () => void
    onProgress: (callback: (progress: UpdateProgress) => void) => () => void
    onDownloaded: (callback: (info: UpdateInfo) => void) => () => void
    onError: (callback: (error: { message: string }) => void) => () => void
  }
}
```

- [ ] **Step 4: 适配 renderer/lib/types.ts**

将 `src/renderer/lib/types.ts` 的 Provider 和 ApiKey 改为从 shared 派生：

```typescript
/**
 * 渲染进程类型定义
 *
 * 本文件包含渲染进程专用的业务类型和 Window 全局声明。
 * 核心实体类型从 shared/types.ts 派生，UI 层不需要 apiKey 等敏感字段。
 */

import type { ProviderEntity, ApiKeyEntity } from '../../shared/types'
import type { LogDebugInfo, UpdateCheckResult, UpdateConfig, UpdateInfo, UpdateProgress } from '../../shared/types'

export type { LogDebugInfo }

/** UI 层 Provider 类型：不含 apiKey 敏感字段 */
export type Provider = Omit<ProviderEntity, 'apiKey'>

/** UI 层 ApiKey 类型 */
export type ApiKey = ApiKeyEntity

/** 请求日志条目（记录了每次代理请求的详细信息） */
export interface LogEntry {
  id: number
  api_key_id: number | null
  provider_id: number | null
  model: string
  api_format: string
  status_code: number
  tokens_in: number
  tokens_out: number
  duration_ms: number
  error: string | null
  created_at: string
  debug?: LogDebugInfo
}

/** 仪表盘概览统计数据 */
export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

/** 本地对话记录（包含关联的供应商、模型和 API Key） */
export interface Conversation {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 单条对话消息（包括用户消息和 AI 回复，thinking 字段记录扩展思维过程） */
export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

/** 代理服务器运行状态 */
export interface ProxyStatus {
  running: boolean
  port: number
  url: string | null
}

declare global {
  interface Window {
    electronAPI: {
      debug: {
        log: (...args: any[]) => void
      }
      backend: {
        onReady: (callback: () => void) => () => void
      }
      providers: {
        list: () => Promise<Provider[]>
        create: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) => Promise<number>
        update: (id: number, data: Record<string, unknown>) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      apiKeys: {
        list: () => Promise<ApiKey[]>
        create: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string; key: ApiKey }>
        delete: (id: number) => Promise<void>
      }
      logs: {
        query: (params: Record<string, unknown>) => Promise<{ logs: LogEntry[]; total: number }>
        stats: (range: string) => Promise<DashboardStats>
        statsDetailed: (range: '24h' | '30d') => Promise<ProviderStatsGroup[]>
      }
      conversations: {
        list: () => Promise<Conversation[]>
        create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) => Promise<Conversation>
        update: (id: number, data: Record<string, unknown>) => Promise<void>
        delete: (id: number) => Promise<void>
        get: (id: number) => Promise<Conversation | null>
        messages: (conversationId: number) => Promise<ConversationMessage[]>
        addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => Promise<ConversationMessage>
      }
      proxy: {
        status: () => Promise<ProxyStatus>
        start: (port?: number) => Promise<boolean>
        stop: () => Promise<void>
        restart: (port?: number) => Promise<boolean>
        setPort: (port: number) => Promise<void>
        getDebugMode: () => Promise<boolean>
        setDebugMode: (enabled: boolean) => Promise<void>
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
      update: {
        check: () => Promise<UpdateCheckResult>
        download: () => Promise<void>
        install: () => Promise<void>
        skipVersion: (version: string) => Promise<void>
        getConfig: () => Promise<UpdateConfig>
        setConfig: (config: Partial<UpdateConfig>) => Promise<void>
        getCurrentVersion: () => Promise<string>
        onAvailable: (callback: (info: UpdateInfo) => void) => () => void
        onProgress: (callback: (progress: UpdateProgress) => void) => () => void
        onDownloaded: (callback: (info: UpdateInfo) => void) => () => void
        onError: (callback: (error: { message: string }) => void) => () => void
      }
    }
  }
}

/** 统计时序数据点 */
export interface StatsDataPoint {
  period: number | string
  requests: number
  tokensIn: number
  tokensOut: number
}

/** 单个模型维度的统计数据 */
export interface ProviderStatsModel {
  model: string
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  totalErrors: number
  dataPoints: StatsDataPoint[]
}

/** 供应商维度的统计分组 */
export interface ProviderStatsGroup {
  providerId: number
  providerName: string
  models: ProviderStatsModel[]
}

export {}
```

- [ ] **Step 5: 运行 TSC 验证全量类型**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/preload/types.ts src/renderer/lib/types.ts
git commit -m "refactor: 类型治理 — 核心实体统一定义在 shared/types.ts

新增 ProviderEntity/ApiKeyEntity/ConversationEntity/ConversationMessageEntity
到 shared/types.ts。preload/types.ts 和 renderer/lib/types.ts 改为 type alias
派生，消除四层重复的类型定义。"
```

---

### Task 4: 模块 G — IPC 输入验证 / Zod schema（Phase 2，可并行于 B/F）

**依赖**: Task 1 (A), `npm install zod`
**目标**: 每个 domain 新增 `{name}.schema.ts`，IPC handler 入口验证输入

**Files:**
- Create: `src/main/domains/provider/provider.schema.ts`
- Create: `src/main/domains/apikey/apikey.schema.ts`
- Create: `src/main/domains/conversation/conversation.schema.ts`
- Create: `src/main/domains/provider/__tests__/provider.schema.test.ts`
- Create: `src/main/domains/apikey/__tests__/apikey.schema.test.ts`
- Create: `src/main/domains/conversation/__tests__/conversation.schema.test.ts`
- Modify: `src/main/ipc/index.ts`（加入 schema 验证）

- [ ] **Step 1: 安装 Zod（RED — 环境前置）**

```bash
npm install zod
```

- [ ] **Step 2: 创建 provider.schema.test.ts — 写失败测试**

```typescript
// src/main/domains/provider/__tests__/provider.schema.test.ts
import { describe, it, expect } from 'vitest'
import { createProviderSchema, updateProviderSchema } from '../provider.schema'

describe('createProviderSchema', () => {
  it('should accept valid provider input', () => {
    const input = {
      name: 'Test Provider',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test-key',
      models: ['gpt-4']
    }
    const result = createProviderSchema.parse(input)
    expect(result.name).toBe('Test Provider')
    expect(result.models).toEqual(['gpt-4'])
  })

  it('should reject missing name', () => {
    const input = { providerType: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject invalid providerType', () => {
    const input = { name: 'Test', providerType: 'gemini', baseUrl: 'https://api.example.com', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject empty models array', () => {
    const input = { name: 'Test', providerType: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-key', models: [] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject non-URL baseUrl', () => {
    const input = { name: 'Test', providerType: 'openai', baseUrl: 'not-a-url', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })
})

describe('updateProviderSchema', () => {
  it('should accept partial update', () => {
    const result = updateProviderSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  it('should accept empty object (all fields optional)', () => {
    const result = updateProviderSchema.parse({})
    expect(result).toEqual({})
  })

  it('should reject invalid providerType in partial update', () => {
    expect(() => updateProviderSchema.parse({ providerType: 'gemini' })).toThrow()
  })
})
```

- [ ] **Step 3: 运行测试 — 确认失败（RED）**

Run: `npx vitest run src/main/domains/provider/__tests__/provider.schema.test.ts`
Expected: FAIL — 文件不存在，module not found

- [ ] **Step 4: 实现 provider.schema.ts（GREEN）**

```typescript
// src/main/domains/provider/provider.schema.ts
import { z } from 'zod'

/**
 * 创建供应商的输入校验 schema
 * name 必填 1-100 字符，providerType 仅限 anthropic/openai，
 * baseUrl 必须是合法 URL，apiKey 必填，models 至少一个模型名
 */
export const createProviderSchema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(['anthropic', 'openai']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string()).min(1)
})

/** 更新供应商的输入校验 schema — 所有字段可选 */
export const updateProviderSchema = createProviderSchema.partial()
```

- [ ] **Step 5: 运行测试 — 确认通过（GREEN）**

Run: `npx vitest run src/main/domains/provider/__tests__/provider.schema.test.ts`
Expected: 7 tests PASS

- [ ] **Step 6: 创建 apikey.schema.test.ts（RED → GREEN 合并）**

```typescript
// src/main/domains/apikey/__tests__/apikey.schema.test.ts
import { describe, it, expect } from 'vitest'
import { createApiKeySchema } from '../apikey.schema'

describe('createApiKeySchema', () => {
  it('should accept valid input', () => {
    const result = createApiKeySchema.parse({ name: 'My Key', rateLimit: 60 })
    expect(result.name).toBe('My Key')
    expect(result.rateLimit).toBe(60)
  })

  it('should default rateLimit when omitted (via optional)', () => {
    const result = createApiKeySchema.parse({ name: 'My Key' })
    expect(result.name).toBe('My Key')
    expect(result.rateLimit).toBeUndefined()
  })

  it('should reject empty name', () => {
    expect(() => createApiKeySchema.parse({ name: '' })).toThrow()
  })

  it('should reject negative rateLimit', () => {
    expect(() => createApiKeySchema.parse({ name: 'Key', rateLimit: -1 })).toThrow()
  })
})
```

```typescript
// src/main/domains/apikey/apikey.schema.ts
import { z } from 'zod'

/**
 * 创建 API Key 的输入校验 schema
 * name 必填 1-100 字符，rateLimit 可选，最小 1，最大 10000
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  rateLimit: z.number().int().min(1).max(10000).optional()
})
```

- [ ] **Step 7: 创建 conversation.schema.test.ts 和实现**

```typescript
// src/main/domains/conversation/__tests__/conversation.schema.test.ts
import { describe, it, expect } from 'vitest'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../conversation.schema'

describe('createConversationSchema', () => {
  it('should accept valid input', () => {
    const result = createConversationSchema.parse({ title: 'Chat', model: 'gpt-4' })
    expect(result.title).toBe('Chat')
  })

  it('should reject empty title', () => {
    expect(() => createConversationSchema.parse({ title: '', model: 'gpt-4' })).toThrow()
  })

  it('should reject empty model', () => {
    expect(() => createConversationSchema.parse({ title: 'Chat', model: '' })).toThrow()
  })

  it('should accept null providerId and apiKeyId', () => {
    const result = createConversationSchema.parse({ title: 'Chat', model: 'gpt-4', providerId: null, apiKeyId: null })
    expect(result.providerId).toBeNull()
  })
})

describe('addMessageSchema', () => {
  it('should accept valid message', () => {
    const result = addMessageSchema.parse({ conversationId: 1, role: 'user', content: 'Hello' })
    expect(result.role).toBe('user')
  })

  it('should reject invalid role', () => {
    expect(() => addMessageSchema.parse({ conversationId: 1, role: 'system', content: 'Hello' })).toThrow()
  })

  it('should accept optional thinking field', () => {
    const result = addMessageSchema.parse({ conversationId: 1, role: 'assistant', content: 'Hi', thinking: 'Let me think...' })
    expect(result.thinking).toBe('Let me think...')
  })
})
```

```typescript
// src/main/domains/conversation/conversation.schema.ts
import { z } from 'zod'

/**
 * 创建会话的输入校验 schema
 * title 和 model 必填，providerId/apiKeyId 可选可为 null
 */
export const createConversationSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().min(1),
  providerId: z.number().int().positive().nullable().optional(),
  apiKeyId: z.number().int().positive().nullable().optional()
})

/** 更新会话的输入校验 schema — 所有字段可选 */
export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().min(1).optional(),
  providerId: z.number().int().positive().nullable().optional(),
  apiKeyId: z.number().int().positive().nullable().optional()
})

/** 添加消息的输入校验 schema */
export const addMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  thinking: z.string().optional()
})
```

- [ ] **Step 8: 运行所有 schema 测试**

Run: `npx vitest run src/main/domains/**
Expected: 所有 schema 测试 PASS

- [ ] **Step 9: 在 ipc/index.ts 中接入 Zod 验证（REFACTOR）**

修改 `ipc/index.ts` 中的 create/update handler，在调用 service 前加入 schema 验证：

```typescript
// 在文件顶部新增 import
import { createProviderSchema, updateProviderSchema } from '../domains/provider/provider.schema'
import { createApiKeySchema } from '../domains/apikey/apikey.schema'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../domains/conversation/conversation.schema'

// 修改 provider:create handler
ipcMain.handle('provider:create', async (_event, data) => {
  const input = createProviderSchema.parse(data)
  return providerService.create(input)
})

// 修改 provider:update handler
ipcMain.handle('provider:update', async (_event, id: number, data) => {
  const input = updateProviderSchema.parse(data)
  return providerService.update(id, input)
})

// 修改 apikey:create handler
ipcMain.handle('apikey:create', async (_event, name: string, rateLimit?: number) => {
  const input = createApiKeySchema.parse({ name, rateLimit })
  return apiKeyService.create(input)
})

// 修改 conversation:create handler
ipcMain.handle('conversation:create', async (_event, data: {
  title: string; model: string; providerId?: number | null; apiKeyId?: number | null
}) => {
  const input = createConversationSchema.parse(data)
  const id = await conversationService.create(input)
  return conversationService.getById(id)
})

// 修改 conversation:update handler
ipcMain.handle('conversation:update', async (_event, id: number, data: {
  title?: string; providerId?: number | null; model?: string; apiKeyId?: number | null
}) => {
  const input = updateConversationSchema.parse(data)
  return conversationService.update(id, input)
})

// 修改 conversation:addMessage handler
ipcMain.handle('conversation:addMessage', async (_event, conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => {
  const input = addMessageSchema.parse({ conversationId, role, content, thinking })
  return conversationService.addMessage(input)
})
```

- [ ] **Step 10: 运行集成测试确认验证不破坏现有功能**

Run: `npx vitest run src/main/ipc/__tests__/integration.test.ts`
Expected: 所有测试 PASS（合法输入未被 Zod 拒绝）

- [ ] **Step 11: 运行 TSC 检查**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json
git add src/main/domains/provider/provider.schema.ts
git add src/main/domains/apikey/apikey.schema.ts
git add src/main/domains/conversation/conversation.schema.ts
git add src/main/domains/provider/__tests__/provider.schema.test.ts
git add src/main/domains/apikey/__tests__/apikey.schema.test.ts
git add src/main/domains/conversation/__tests__/conversation.schema.test.ts
git add src/main/ipc/index.ts
git commit -m "feat: IPC 输入验证 — Zod schema 接入 create/update handler

新增 provider/apikey/conversation 三个 domain 的 Zod schema，
在 IPC handler 入口处对 create/update 输入进行校验。
非法输入（错误枚举值、空字段）在 IPC 入口即被拒绝。"
```

---

### Task 5: 模块 C — 拆分 converter.ts（Phase 3，可并行于 D/E）

**依赖**: 无（独立于 A/B/F/G）
**目标**: `proxy/converter.ts`（1395 行）拆为目录 `proxy/converter/`（5 文件），`index.ts` 向后兼容

**Files:**
- Create: `src/main/proxy/converter/types.ts`
- Create: `src/main/proxy/converter/request.ts`
- Create: `src/main/proxy/converter/response.ts`
- Create: `src/main/proxy/converter/sse.ts`
- Create: `src/main/proxy/converter/index.ts`
- Delete: `src/main/proxy/converter.ts`（内容迁移到新目录后删除）
- Test: `src/main/proxy/__tests__/converter.test.ts`（适配 import 路径）

- [ ] **Step 1: 运行现有 converter 测试确认基线**

Run: `npx vitest run src/main/proxy/__tests__/converter.test.ts`
Expected: 所有测试 PASS

- [ ] **Step 2: 创建 converter/types.ts**

从 `converter.ts` 提取所有类型定义（`StreamContext`、`ConversionDirection` 等）：

```typescript
// src/main/proxy/converter/types.ts
/**
 * 协议转换共享类型
 * 定义转换器内部使用的接口和类型别名
 */

/** 请求格式方向 */
export type ConversionDirection = 'openai' | 'anthropic'

/**
 * 流式转换上下文（OpenAI SSE → Anthropic SSE 方向使用）
 * Anthropic SSE 需要结构化事件序列（message_start → content_block_start → delta → stop），
 * 而 OpenAI SSE 是扁平事件流，因此需要维护状态机追踪当前 content_block 类型和索引
 */
export interface StreamContext {
  /** 当前状态：message_start 已发送？ */
  messageStarted: boolean
  /** 当前打开的 content_block 类型（text/thinking/tools），用于判断是否需要发送 content_block_stop */
  currentBlockType: string | null
  /** content_block 序号 */
  blockIndex: number
  /** 累积的文本内容（用于去重 finish_reason 中的 content 重复） */
  accumulatedContent: string
  /** 累积的思考内容 */
  accumulatedThinking: string
  /** Anthropic 消息 ID */
  messageId: string
  /** 模型名称缓存（message_start 事件中提取） */
  modelName: string
}

/** Anthropic content block */
export interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

/** Anthropic tool use block */
export interface ToolUseBlock {
  id: string
  name: string
  input: Record<string, unknown>
}
```

- [ ] **Step 3: 迁移 request.ts 转换逻辑**

将 `converter.ts` 中 `convertRequest()` 函数及其内部辅助函数（约 400 行）迁移到 `converter/request.ts`。保持函数签名不变：

```typescript
// src/main/proxy/converter/request.ts
/**
 * 协议请求体转换
 * 支持 OpenAI ↔ Anthropic 双向转换（请求体）
 */
import type { ConversionDirection } from './types'

/**
 * 转换请求体从一种协议到另一种
 * @param body — 原始请求体
 * @param from — 源协议格式
 * @param to — 目标协议格式
 * @returns [convertedBody, convertedPath]
 */
export function convertRequest(
  body: Record<string, any>,
  from: ConversionDirection,
  to: ConversionDirection
): [Record<string, any>, string] {
  // ... 完整实现从 converter.ts 迁移
}
```

**注意**: 实现者应从 `converter.ts` 第 51 行到约第 450 行提取 `convertRequest` 及其所有辅助函数，完整迁移到 `request.ts`。不要重写逻辑，保持字节级一致。

- [ ] **Step 4: 迁移 response.ts 转换逻辑**

将 `converter.ts` 中 `convertResponse()` 函数及其辅助函数（约 300 行）迁移到 `converter/response.ts`。

- [ ] **Step 5: 迁移 sse.ts 转换逻辑**

将 `converter.ts` 中 `convertSSEEvent()`、`createStreamContext()`、`anthropicSSEToOpenAI()`、`openAISSEToAnthropic()` 及 `mapFinishReason()` 函数（约 500 行）迁移到 `converter/sse.ts`。

- [ ] **Step 6: 创建 index.ts 保持向后兼容**

```typescript
// src/main/proxy/converter/index.ts
/**
 * 协议转换器统一导出
 * 调用方无需改动 import 路径，保持向后兼容
 */
export { convertRequest } from './request'
export { convertResponse } from './response'
export { convertSSEEvent, createStreamContext, mapFinishReason } from './sse'
export type { StreamContext, ConversionDirection } from './types'
```

- [ ] **Step 7: 适配 converter.test.ts 的 import 路径**

`converter.test.ts` 当前从 `'../converter'` 导入。由于我们创建了 `converter/index.ts` 作为 barrel export，import 路径无需修改。确认测试仍通过：

Run: `npx vitest run src/main/proxy/__tests__/converter.test.ts`
Expected: 所有测试 PASS

- [ ] **Step 8: 删除旧 converter.ts 文件**

```bash
rm src/main/proxy/converter.ts
```

- [ ] **Step 9: 确认 TSC 和测试全量通过**

Run: `npx tsc --noEmit`
Expected: 零错误

Run: `npx vitest run src/main/proxy/__tests__/converter.test.ts`
Expected: 所有测试 PASS

- [ ] **Step 10: Commit**

```bash
git add src/main/proxy/converter/
git rm src/main/proxy/converter.ts
git commit -m "refactor: 拆分 converter.ts 为 converter/ 目录（5 文件）

proxy/converter.ts（1395 行）按职责拆分为：
- types.ts (~60 行) — StreamContext、ConversionDirection 等共享类型
- request.ts (~450 行) — convertRequest() + 消息/tools/system 转换
- response.ts (~350 行) — convertResponse() + content 块/usage 映射
- sse.ts (~520 行) — convertSSEEvent() + 双方向 SSE 状态机
- index.ts — barrel export，保持 import 路径向后兼容"
```

---

### Task 6: 模块 D — SSE 解析统一（Phase 3，可并行于 C/E）

**依赖**: Task 5 (C) — converter/sse.ts 必须已存在
**目标**: `sse-parser.ts` 成为 SSE 基础解析唯一来源，SSE 事件类型放入 `shared/types.ts`

**Files:**
- Modify: `src/main/ipc/sse-parser.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/proxy/converter/sse.ts`

- [ ] **Step 1: 在 shared/types.ts 新增 SSE 事件类型**

在 `src/shared/types.ts` 末尾追加：

```typescript
// ====== SSE 事件类型（主进程/渲染进程共享） ======

/** 解析后的 SSE 行 */
export interface ParsedSSELine {
  /** SSE 事件类型（event: 字段），如 'message_start'、'content_block_delta' 等 */
  event: string | null
  /** SSE 数据体（data: 字段的 JSON 字符串值） */
  data: string | null
}

/** OpenAI SSE delta 结构 */
export interface OpenAISSEChoice {
  delta?: {
    content?: string
    reasoning_content?: string
    tool_calls?: Array<{
      index: number
      id?: string
      function?: { name?: string; arguments?: string }
    }>
  }
  finish_reason?: string | null
}

/** OpenAI SSE 响应结构（单行 data: 的 JSON 内容） */
export interface OpenAISSEPayload {
  choices?: OpenAISSEChoice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}
```

- [ ] **Step 2: 在 sse-parser.ts 中导出类型接口**

在 `src/main/ipc/sse-parser.ts` 中增加类型导出，从 shared 引用：

```typescript
// 文件顶部新增 export
export type { ParsedSSELine, OpenAISSEPayload } from '../../shared/types'
```

- [ ] **Step 3: converter/sse.ts 复用 parseSSELine**

在 `src/main/proxy/converter/sse.ts` 中，将内部 SSE 行解析替换为调用 `sse-parser.ts` 的 `parseSSELine()`：

```typescript
// 新增 import
import { parseSSELine } from '../../ipc/sse-parser'
import type { ParsedSSELine } from '../../shared/types'
```

在 `converter/sse.ts` 中找到手动解析 SSE 行的地方（如 `line.startsWith('event:')` 和 `line.startsWith('data:')`），替换为：

```typescript
// 之前：
const eventMatch = line.match(/^event:\s*(.+)$/)
const dataMatch = line.match(/^data:\s*(.+)$/)

// 之后：
const parsed: ParsedSSELine | null = parseSSELine(line)
if (parsed?.event) { ... }
if (parsed?.data) { ... }
```

- [ ] **Step 4: 运行测试确认**

Run: `npx vitest run src/main/ipc/__tests__/sse-parser.test.ts src/main/proxy/__tests__/converter.test.ts`
Expected: 所有 SSE parser 和 converter 测试 PASS

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/sse-parser.ts src/shared/types.ts src/main/proxy/converter/sse.ts
git commit -m "refactor: SSE 解析统一 — sse-parser.ts 作为唯一基础解析源

shared/types.ts 新增 ParsedSSELine/OpenAISSEPayload 类型，
converter/sse.ts 内部 SSE 行解析改为复用 sse-parser.ts 的 parseSSELine()，
消除 converter 层重复实现的 SSE 行解析逻辑。"
```

---

### Task 7: 模块 E — proxy 日志走 core/logger（Phase 3，可并行于 C/D）

**依赖**: 无
**目标**: `proxy/server.ts` 不再用 `fs.appendFileSync` 直接写文件，改为 `core/logger.ts` file transport

**Files:**
- Modify: `src/main/core/logger.ts`
- Modify: `src/main/proxy/server.ts`
- Modify: `src/main/core/__tests__/logger.test.ts`

- [ ] **Step 1: 扩写 logger.test.ts — 新增 file transport 测试（RED）**

```typescript
// 在 src/main/core/__tests__/logger.test.ts 追加
import { describe, it, expect, afterEach } from 'vitest'
import { createLogger } from '../logger'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('createLogger with file transport', () => {
  const tmpDir = path.join(os.tmpdir(), 'llm-gateway-logger-test')

  afterEach(() => {
    // 清理测试文件
    try { fs.rmSync(tmpDir, { recursive: true }) } catch {}
  })

  it('should write log messages to specified file', async () => {
    const logPath = path.join(tmpDir, 'test.log')
    const log = createLogger('test-logger', { file: logPath })

    log.info('test message', { key: 'value' })

    // 等待异步写入完成
    await new Promise(resolve => setTimeout(resolve, 100))

    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('[test-logger]')
    expect(content).toContain('test message')
    // JSON payload 不应包含敏感字段
    expect(content).toContain('"key":"value"')
  })

  it('should sanitize authorization header in file transport', async () => {
    const logPath = path.join(tmpDir, 'sanitize.log')
    const log = createLogger('test', { file: logPath })

    log.info('request', { headers: { authorization: 'Bearer sk-secret-key-12345' } })

    await new Promise(resolve => setTimeout(resolve, 100))

    const content = fs.readFileSync(logPath, 'utf-8')
    // 应脱敏为短前缀
    expect(content).not.toContain('sk-secret-key-12345')
    expect(content).toContain('Bearer ...')
  })

  it('should not affect console output when file transport is enabled', () => {
    const logPath = path.join(tmpDir, 'console.log')
    const log = createLogger('test', { file: logPath })

    // 不应抛出异常
    expect(() => log.info('console message')).not.toThrow()
    expect(() => log.error('error message')).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试 — 确认失败（RED）**

Run: `npx vitest run src/main/core/__tests__/logger.test.ts`
Expected: 新增 3 个测试 FAIL — `createLogger` 不支持 `{ file }` 选项

- [ ] **Step 3: 扩展 core/logger.ts 支持 file transport（GREEN）**

```typescript
/**
 * 统一日志模块
 *
 * 提供带时间戳和模块名的结构化日志输出，支持 debug/info/warn/error 四个级别。
 * 可选 file transport 支持写入日志文件（异步追加）。
 * 所有主进程模块应通过 createLogger() 创建自己的日志实例，禁止直接使用 console.log。
 */

import * as fs from 'fs'
import * as path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

/** file transport 配置 */
interface FileTransportOptions {
  /** 日志文件绝对路径 */
  file: string
}

/**
 * 创建模块化日志实例
 * @param moduleName - 模块名称，出现在每条日志的 [MODULE] 前缀中
 * @param opts - 可选配置：file transport 路径
 */
export function createLogger(moduleName: string, opts?: FileTransportOptions): Logger {
  // 确保日志文件所在目录存在（仅当指定 file 时）
  if (opts?.file) {
    const dir = path.dirname(opts.file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /** 脱敏对象中的敏感字段（authorization 等） */
  function sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (key === 'authorization' && typeof value === 'string') {
        result[key] = value.slice(0, 10) + '...'
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = sanitize(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }

  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level.toUpperCase()}] [${moduleName}]`
    const sanitizedData = data ? sanitize(data) : undefined
    const payload = sanitizedData ? ` ${JSON.stringify(sanitizedData)}` : ''
    const line = `${prefix} ${message}${payload}`

    // 控制台输出
    switch (level) {
      case 'error': console.error(line); break
      case 'warn': console.warn(line); break
      case 'debug': console.debug(line); break
      default: console.log(line); break
    }

    // file transport（异步追加，不阻塞主线程）
    if (opts?.file) {
      fs.appendFile(opts.file, line + '\n', (err) => {
        // 文件写入失败静默忽略，避免日志系统自身崩溃影响业务
        if (err) {
          console.error(`[LOGGER] Failed to write to ${opts.file}: ${err.message}`)
        }
      })
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

- [ ] **Step 4: 运行测试 — 确认通过（GREEN）**

Run: `npx vitest run src/main/core/__tests__/logger.test.ts`
Expected: 所有测试 PASS

- [ ] **Step 5: 适配 proxy/server.ts — 替换 fs.appendFileSync（REFACTOR）**

将 `src/main/proxy/server.ts` 的调试日志改为使用 `createLogger` 的 file transport：

```typescript
// 删除以下代码：
// const LOG_DIR = process.cwd()
// const AUTH_LOG = path.join(LOG_DIR, 'llm-gateway-auth-debug.log')
// function authDebugLog(...args: any[]) { fs.appendFileSync(...) }
// const PROXY_LOG = path.join(LOG_DIR, 'llm-gateway-proxy-debug.log')
// function proxyDebugLog(section: string, data: Record<string, any>) { fs.appendFileSync(...) }

// 新增（在 createServer 外部）：
import { createLogger } from '../core/logger'
import * as path from 'path'

const LOG_DIR = process.cwd()
const authLog = createLogger('proxy:auth', { file: path.join(LOG_DIR, 'llm-gateway-auth-debug.log') })
const proxyLog = createLogger('proxy:debug', { file: path.join(LOG_DIR, 'llm-gateway-proxy-debug.log') })
```

替换所有调用点：
- `authDebugLog('REQUEST', { ... })` → `authLog.info('REQUEST', { ... })`
- `authDebugLog('AUTH FAIL: ...')` → `authLog.warn('AUTH FAIL', { ... })`
- `authDebugLog('AUTH OK', { ... })` → `authLog.info('AUTH OK', { ... })`
- `proxyDebugLog('CLIENT_REQUEST', { ... })` → `proxyLog.info('CLIENT_REQUEST', { ... })`
- `proxyDebugLog(section, data)` （其他调用点） → `proxyLog.info(section, data)`

- [ ] **Step 6: 删除 server.ts 中不再需要的 import**

移除 `import * as fs from 'fs'`（如果仅用于 debug log）。

- [ ] **Step 7: 验证 fs.appendFileSync 已清除**

Run: `bash -c "grep 'fs.appendFileSync' src/main/proxy/server.ts"`
Expected: 空输出

- [ ] **Step 8: 运行全量测试**

Run: `npx vitest run src/main/core/__tests__/logger.test.ts src/main/proxy/__tests__/server.test.ts`
Expected: 所有测试 PASS

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 9: Commit**

```bash
git add src/main/core/logger.ts src/main/core/__tests__/logger.test.ts src/main/proxy/server.ts
git commit -m "refactor: proxy 日志统一走 core/logger file transport

core/logger.ts 新增 file transport 支持（异步 fs.appendFile + authorization 脱敏）。
proxy/server.ts 的 authDebugLog/proxyDebugLog 替换为 createLogger('proxy:*', {file})，
移除 fs.appendFileSync 同步 I/O，消除对统一日志通道的绕过。"
```

---

### Task 8: Phase 4 — 最终验证

**依赖**: Task 1-7 全部完成
**目标**: 全量 TSC 编译 + 测试 + 构建 + ARCHITECTURE.md 更新

- [ ] **Step 1: 全量 TSC 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 2: 全量测试**

Run: `npx vitest run`
Expected: 所有测试 PASS（排除预存的 1 个超时）

- [ ] **Step 3: 全量 ESLint**

Run: `npm run lint`
Expected: 零 warning/error

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 验收标准检查**

Run: `bash -c "grep -n \"from '../db/\" src/main/ipc/index.ts | grep -v connection"`
Expected: 空输出（IPC 不直接 import db/ 函数，仅保留 connection）

Run: `bash -c "grep -c 'providerMap' src/main/ipc/index.ts"`
Expected: `0`（detailedStats 重复已消除）

Run: `bash -c "ls src/main/proxy/converter/"`
Expected: `index.ts  request.ts  response.ts  sse.ts  types.ts`

Run: `bash -c "grep 'fs.appendFileSync' src/main/proxy/server.ts"`
Expected: 空输出

- [ ] **Step 6: 更新 ARCHITECTURE.md**

根据架构变更更新 `docs/ARCHITECTURE.md`：
- Section 5.3：标注 domains/ 层已被 IPC 使用（不再死代码）
- Section 5.2：converter/ 目录结构更新（5 文件）
- Section 5.1：日志系统增加 file transport 描述
- Section 6.1：Domain 模式增加 `{name}.schema.ts` 可选文件
- 日期更新为 2026-06-03

- [ ] **Step 7: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: 更新 ARCHITECTURE.md 反映架构分层修复结果

- domains/ 层已复活，IPC → service → db 三层生效
- converter.ts 拆分为 converter/ 目录（5 文件）
- core/logger.ts 新增 file transport
- domain 模式增加 Zod schema 文件"
```

---

### Task 9: 模块 H — proxy/server.ts 管道化（Phase 5，可选）

**依赖**: Task 5 (C)
**优先级**: 低，视前 8 个 Task 完成后的状态决定是否执行

**目标**: `handleProxyRequest()` 从单一大函数重构为 Pipeline 编排器

**Files:**
- Create: `src/main/proxy/pipeline.ts`
- Modify: `src/main/proxy/server.ts`
- Create: `src/main/proxy/__tests__/pipeline.test.ts`

如果执行此 Task，需单独编写详细的 TDD 步骤。当前可跳过，推迟到后续迭代。

---

## 实施依赖图

```
Phase 1:  Task 1 (A: 复活 domains/)
              │
Phase 2:  ┌───┼───┐
          │   │   │
     Task 2   │   Task 4 (G: Zod 验证)
     (B: 重复) │      ↑
              │   npm install zod
          Task 3 (F: 类型治理)

Phase 3:  Task 5 (C: 拆分 converter) ── 独立
          Task 6 (D: SSE 统一) ── 依赖 Task 5
          Task 7 (E: 日志统一) ── 独立

Phase 4:  Task 8 (最终验证) ── 依赖全部

Phase 5:  Task 9 (H: 管道化) ── 可选，依赖 Task 5
```

## 执行策略

Phase 2 的 Task 2/3/4 可并行派发给 3 个子代理，Phase 3 的 Task 5/6/7 也可并行（但 Task 6 需在 Task 5 完成后执行）。
