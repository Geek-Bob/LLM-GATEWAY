# 架构分层修复 — 设计文档

**日期**: 2026-06-03
**状态**: 设计完成，待实施
**依赖**: 启动性能优化（2026-06-03）已完成

---

## 背景

架构审查发现 8 个问题：domains/ 层死代码、detailedStats 聚合逻辑重复、converter.ts 1395 行上帝类、SSE 解析三处分散、类型四层重复、proxy 日志绕过统一通道、IPC 缺少输入验证。本文档定义修复方案。

## 核心决策

| 决策 | 选项 | 选择 |
|------|------|------|
| domains/ 层 | 消灭 vs 复活 | **复活**：IPC → service → db 完整三层 |
| converter 拆分 | 3 文件 vs 6 文件 | **温和拆分**：request.ts + response.ts + sse.ts |
| 修复范围 | 分批 vs 全部 | **一次性修完 8 项** |

---

## 目标架构

```
Renderer (TanStack Query)
  → preload bridge (ipc.ts)
    → ipcMain.handle
      → Zod 验证 (schema.ts)        ← 新增
      → domains/{name}.service.ts   ← 复活
        → db/{name}.ts              ← 纯数据访问
```

```
proxy/converter/
├── types.ts       ← 共享类型
├── request.ts     ← convertRequest
├── response.ts    ← convertResponse
├── sse.ts         ← convertSSEEvent + StreamContext
└── index.ts       ← re-export（向后兼容）
```

```
core/logger.ts     ← 增加 file transport
proxy/server.ts    ← 调试日志走 logger，移除 fs.appendFileSync
shared/types.ts    ← 统一核心实体类型
```

---

## 模块 A：复活 domains/ 层

### 目标

IPC handler 全部委托到 domain service，不再直调 `db/` 函数。

### 改动

| 文件 | 动作 |
|------|------|
| `src/main/ipc/index.ts` | 重构全部 handler：import domain service 工厂函数 → 通过 `getDb()` 注入 → 委托调用。删除内联的 detailedStats 聚合逻辑（第 105-169 行，共 ~65 行） |
| `src/main/domains/provider/provider.service.ts` | 已有正确实现，无需改动 |
| `src/main/domains/apikey/apikey.service.ts` | 已有正确实现，无需改动 |
| `src/main/domains/conversation/conversation.service.ts` | 已有正确实现，无需改动 |
| `src/main/domains/logs/logs.service.ts` | 已有正确实现，无需改动 |
| `src/main/domains/stats/stats.service.ts` | 已有正确实现，无需改动 |

### 委托映射

```
provider:list     → providerService.list()
provider:create   → providerService.create(input)
provider:update   → providerService.update(id, input)
provider:delete   → providerService.remove(id)
apikey:list       → apiKeyService.list()
apikey:create     → apiKeyService.create(name, rateLimit)
apikey:delete     → apiKeyService.remove(id)
conversation:list   → conversationService.list()
conversation:create → conversationService.create(data)
conversation:update → conversationService.update(id, data)
conversation:delete → conversationService.remove(id)
conversation:get    → conversationService.getById(id)
conversation:messages → conversationService.messages(conversationId)
conversation:addMessage → conversationService.addMessage(input)
logs:query           → logsService.query(params)
logs:stats           → logsService.stats(range)
logs:statsDetailed   → logsService.detailedStats(range)  ← 消除重复
```

### 验证标准

- TSC 零错误
- 现有 IPC handler 测试全部通过
- `grep "from '../db/" src/main/ipc/index.ts` 返回空（IP 层不再直接 import db/）——例外：`db/connection` 的 `getDb` 用于注入 service

---

## 模块 B：消除 detailedStats 重复

### 目标

聚合逻辑只存在于 `logs.service.ts`，`ipc/index.ts` 中删除重复。

### 改动

- `ipc/index.ts`：删除第 105-169 行的内联 Map 聚合代码，改为 `return logsService.detailedStats(range)`
- `logs.service.ts`：保留现有实现（已是正确版本）

---

## 模块 C：拆分 converter.ts

### 目标

`proxy/converter.ts`（1395 行）拆为 3 个功能文件 + 1 个类型文件，通过 `index.ts` 保持向后兼容。

### 新目录结构

```
proxy/converter/
├── types.ts       # StreamContext, ConversionDirection, 共享 interface
├── request.ts     # convertRequest() — OpenAI↔Anthropic 请求体转换
├── response.ts    # convertResponse() — 非流式响应转换
├── sse.ts         # convertSSEEvent() + createStreamContext() + SSE 状态机
└── index.ts       # re-export 全部公开 API
```

### 拆分规则

| 新文件 | 包含函数 | 预计行数 |
|--------|---------|---------|
| `types.ts` | `StreamContext` 接口、`ConversionDirection` 类型、`ToolUseBlock` 等辅助类型 | ~100 |
| `request.ts` | `convertRequest()` + 内部辅助函数（messages 转换、tools 转换、system 消息提取） | ~400 |
| `response.ts` | `convertResponse()` + 内部辅助函数（content 块转换、usage 映射） | ~300 |
| `sse.ts` | `convertSSEEvent()`、`createStreamContext()`、`anthropicSSEToOpenAI()`、`openAISSEToAnthropic()` + 状态机逻辑 | ~500 |
| `index.ts` | 仅 re-export | ~10 |

### 向后兼容

```typescript
// index.ts — 调用方无需改动
export { convertRequest } from './request'
export { convertResponse } from './response'
export { convertSSEEvent, createStreamContext } from './sse'
export type { StreamContext } from './types'
```

现有 `server.ts` 中的 `import { ... } from './converter'` 无需修改。

### 验证标准

- 所有现有 `converter` 相关测试通过
- TSC 零错误
- `import { convertRequest, convertResponse, convertSSEEvent, createStreamContext } from './converter'` 仍然有效

---

## 模块 D：SSE 解析统一

### 目标

`sse-parser.ts` 成为 SSE 基础解析的唯一来源，converter 和 useChatStream 复用其类型和函数。

### 改动

| 文件 | 动作 |
|------|------|
| `src/main/ipc/sse-parser.ts` | 新增导出类型接口：`SSEEvent { event?, data }`、`ParsedSSELine`。不改动现有函数实现 |
| `src/main/proxy/converter/sse.ts` | 删除内部 SSE 行解析逻辑，导入 `sse-parser.ts` 的 `parseSSELine()` |
| `src/renderer/features/chat/hooks/useChatStream.ts` | 类型标注引用 `sse-parser.ts` 的导出类型（需通过 shared 桥接或主进程类型传递） |

### 注意

渲染进程不能直接 import 主进程文件（编译隔离）。`useChatStream.ts` 中的类型标注方案二选一：
- A：在 `shared/types.ts` 中定义 SSE 事件类型，渲染进程直接引用
- B：`useChatStream.ts` 中本地定义类型，但确保与 `sse-parser.ts` 的类型签名一致

**选择 A**：SSE 事件类型放入 `shared/types.ts`，两边共享。

---

## 模块 E：proxy 日志走 core/logger

### 目标

`proxy/server.ts` 不再使用 `fs.appendFileSync` 直接写文件，改为通过 `core/logger.ts` 的 file transport。

### 改动

| 文件 | 动作 |
|------|------|
| `src/main/core/logger.ts` | 新增 `file` transport 支持：`createLogger(name, { file?: string })`，写入指定文件路径，异步追加 |
| `src/main/proxy/server.ts` | 删除 `AUTH_LOG`、`PROXY_LOG` 常量，删除 `authDebugLog()` 和 `proxyDebugLog()` 函数。替换为 `const log = createLogger('proxy:auth', { file: '...' })` 和 `const proxyLog = createLogger('proxy:debug', { file: '...' })` |

### 日志脱敏

`proxy/server.ts` 中原有的 `authorization` 头脱敏逻辑（`'Bearer gtwy-...'`）需移到 `core/logger.ts` 的 file transport 配置中，作为通用脱敏规则。

### 验证标准

- `grep "fs.appendFileSync" src/main/proxy/server.ts` 返回空
- 调试日志文件仍然正常写入（通过 `createLogger` file transport）
- 脱敏逻辑保持有效

---

## 模块 F：类型治理 — shared/types.ts 统一核心实体

### 目标

`Provider`、`ApiKey`、`Conversation`、`ConversationMessage` 的基础接口定义集中在 `shared/types.ts`，各层通过派生使用。

### 新增类型（shared/types.ts）

```typescript
/** 核心实体：LLM 供应商（内部完整字段） */
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

/** 核心实体：Gateway API Key */
export interface ApiKeyEntity {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

/** 核心实体：对话 */
export interface ConversationEntity {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 核心实体：对话消息 */
export interface ConversationMessageEntity {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}
```

### 各层适配

| 层级 | 文件 | 改动 |
|------|------|------|
| db | `db/providers.ts` | `Provider` 接口改为 `export interface Provider extends ProviderEntity {}` |
| db | `db/api-keys.ts` | 引用 `ApiKeyEntity` |
| domain | `provider/provider.types.ts` | `ProviderResponse` 保留（不含 apiKey），标注为 `Omit<ProviderEntity, 'apiKey'>` |
| renderer | `lib/types.ts` | `Provider` 改为 `Omit<ProviderEntity, 'apiKey'>` |
| renderer | `lib/types.ts` | `ApiKey` 引用 `ApiKeyEntity` |
| preload | `types.ts` | 删除重复的 Provider/ApiKey 接口定义，引用 shared |

### 验证标准

- 所有文件 TSC 编译通过
- 无类型冲突（不同层同名类型不再冲突）
- `grep "interface Provider" src/` 只返回 shared/types.ts 中的一处定义（派生除外）

---

## 模块 G：IPC 输入验证（Zod schema）

### 目标

每个 domain 新增 `{name}.schema.ts`，IPC handler 入口处进行 Zod 验证。Zod 已在项目中安装。

### 新增文件

| 文件 | 内容 |
|------|------|
| `domains/provider/provider.schema.ts` | `createProviderSchema`、`updateProviderSchema`（Zod object） |
| `domains/apikey/apikey.schema.ts` | `createApiKeySchema`（name string, rateLimit optional number） |
| `domains/conversation/conversation.schema.ts` | `createConversationSchema`、`updateConversationSchema`、`addMessageSchema` |

### Schema 定义

```typescript
// provider.schema.ts
import { z } from 'zod'

export const createProviderSchema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(['anthropic', 'openai']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string()).min(1)
})

export const updateProviderSchema = createProviderSchema.partial()
```

### IPC handler 中的使用

```typescript
ipcMain.handle('provider:create', async (_event, data) => {
  const input = createProviderSchema.parse(data)
  return providerService.create(input)
})
```

### 验证标准

- 非法输入（缺少必填字段、错误枚举值）在 IPC 入口被 Zod 拒绝
- 合法输入正常通过
- 不破坏现有功能

---

## 模块 H：proxy/server.ts 管道化（可选，低优先级）

### 目标

`handleProxyRequest()` 从单一大函数重构为 Pipeline 编排器，每个阶段独立可测试。

### 设计

```typescript
// 管道步骤接口
interface PipelineStep {
  name: string
  execute(ctx: PipelineContext): Promise<PipelineContext>
}

// 现有 handleProxyRequest 拆为 6 个步骤
class AuthStep implements PipelineStep { ... }       // 认证
class RateLimitStep implements PipelineStep { ... }  // 限流
class RouteStep implements PipelineStep { ... }      // 路由解析
class ConvertStep implements PipelineStep { ... }    // 协议转换
class ForwardStep implements PipelineStep { ... }    // 上游转发
class AuditStep implements PipelineStep { ... }      // 日志+统计
```

### 注意

此模块标记为**低优先级**。如果时间允许（前 7 个模块顺利完成），可实施。如果前 7 个模块已消耗足够时间，可推迟到后续迭代。

---

## 实施顺序

```
Phase 1: A (复活 domains/) ─── 基础重构，后续全部依赖它
         │
Phase 2: B (消除重复) + F (类型治理) + G (输入验证) ─── 可并行
         │
Phase 3: C (拆分 converter) + D (SSE 统一) + E (日志统一) ─── 可并行
         │
Phase 4: 最终验证（TSC + 全量测试 + 构建）
         │
Phase 5: H (管道化) — 可选，视进度决定
```

### 依赖约束

- **A 必须先做**：后续模块依赖 IPC → service 的正确通道
- **B 依赖 A**：日志 service 被正确注入后才能消除 IPC 内联
- **F 依赖 A**：类型治理涉及各层 import 路径调整
- **G 依赖 A**：schema 需要在 IPC handler 改造后接入
- **C/D/E 独立**：不依赖 A，可随时执行
- **H 依赖 C**（如果实施）：管道化需在 converter 拆分后进行

---

## 验收标准

1. **TSC 编译**：零错误
2. **全量测试**：所有现有测试通过
3. **IPC 分层**：`ipc/index.ts` 不再直接 import `db/providers`、`db/api-keys`、`db/conversations`、`db/logs`（`db/connection` 的 `getDb` 除外）
4. **无重复逻辑**：`detailedStats` 聚合只在 `logs.service.ts` 中存在
5. **converter 拆分**：新目录 `proxy/converter/` 包含 5 个文件，`index.ts` 保持向后兼容
6. **类型统一**：`shared/types.ts` 包含核心实体基础定义，各层无重复的同名接口
7. **日志统一**：`proxy/server.ts` 中无 `fs.appendFileSync` 调用
8. **输入验证**：各 domain 的 `create`、`update` handler 入口有 Zod schema
9. **构建成功**：`npm run build` 无错误
