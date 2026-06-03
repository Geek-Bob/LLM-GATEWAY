# Chat 流端点统一 — 删除 /v1/chat/stream 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `src/main/domains/chat/` 整个目录和 `POST /v1/chat/stream` 路由，将 useChatStream 改造为按 providerType 分路由调用标准代理端点（`/v1/chat/completions` 或 `/v1/messages`），解析标准 SSE 格式。

**Architecture:** 删除冗余的 chat domain（3 文件 + server.ts 中路由），useChatStream 根据 `providerType` 参数选择端点路径和 SSE 解析策略，proxy 的 `handleProxyRequest` 已有的双向协议转换能力保持不变。`StreamMessage` 接口保持向后兼容。

**Tech Stack:** TypeScript 6.0, React 19.2, Hono 4.x, vitest

---

## 文件变更总览

| 操作 | 文件 |
|------|------|
| **删除** | `src/main/domains/chat/chat.service.ts` |
| **删除** | `src/main/domains/chat/chat.stream.ts` |
| **删除** | `src/main/domains/chat/chat.types.ts` |
| **删除目录** | `src/main/domains/chat/` |
| **修改** | `src/main/proxy/server.ts` — 删除 import + /v1/chat/stream 路由 |
| **修改** | `src/renderer/features/chat/hooks/useChatStream.ts` — 重写 SSE 解析 |
| **修改** | `src/main/proxy/__tests__/server.test.ts` — 删除 chat/stream 测试 |
| **修改** | `scripts/test-chat-endpoint.ts` — 改用标准端点 |
| **修改** | `docs/ARCHITECTURE.md` — 删除 chat domain 和 chat/stream 引用 |
| **修改** | `.claude/rules/20-directory.md` — 删除 chat domain 目录项 |
| **修改** | `.claude/rules/40-api.md` — 删除 chat/stream 端点（本次无需改，已无引用） |
| **修改** | `.claude/rules/00-core.md` — 确认后微调 |

---

### Task 1: 删除 chat domain 目录

**Files:**
- Delete: `src/main/domains/chat/chat.service.ts`
- Delete: `src/main/domains/chat/chat.stream.ts`
- Delete: `src/main/domains/chat/chat.types.ts`
- Delete: `src/main/domains/chat/` (directory)

- [ ] **Step 1: 删除整个 chat domain 目录**

```bash
rm -rf src/main/domains/chat
```

- [ ] **Step 2: 验证编译不报错（预期会因 server.ts 中残留 import 而失败，确认错误信息为 "Cannot find module"）**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 包含 `Cannot find module '../domains/chat/chat.service'` 等错误（server.ts 仍引用已删除文件）

- [ ] **Step 3: Commit**

```bash
git add src/main/domains/chat/
git commit -m "feat: 删除 chat domain 目录（chat.service/chat.stream/chat.types）"
```

---

### Task 2: 清理 server.ts 中的 chat/stream 路由和 import

**Files:**
- Modify: `src/main/proxy/server.ts:14-15,135-148`

- [ ] **Step 1: 删除 chat domain 的 import 语句**

找到并删除第 14-15 行：
```typescript
import { createChatService } from '../domains/chat/chat.service'
import { createSSEResponse } from '../domains/chat/chat.stream'
```

删除：
```typescript
import { createChatService } from '../domains/chat/chat.service'
import { createSSEResponse } from '../domains/chat/chat.stream'
```

- [ ] **Step 2: 删除 /v1/chat/stream 路由定义**

找到并删除第 135-148 行：
```typescript
  // POST /v1/chat/stream - internal renderer chat (SSE ChatChunk format)
  const chatService = createChatService()
  app.post('/v1/chat/stream', async (c) => {
    const body = await c.req.json()
    const { model, messages, stream = false } = body
    const authHeader = c.req.header('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    if (!stream) {
      return c.json({ error: 'Non-streaming not yet supported' }, 501)
    }

    return createSSEResponse(chatService.send(model, messages, token))
  })
```

- [ ] **Step 3: 验证编译通过**

```bash
npx tsc --noEmit 2>&1
```

Expected: 无错误（或仅剩 useChatStream.ts 相关可选错误）

- [ ] **Step 4: Commit**

```bash
git add src/main/proxy/server.ts
git commit -m "feat: 删除 /v1/chat/stream 路由和 chat domain import"
```

---

### Task 3: 改造 useChatStream.ts — 按 providerType 分路由，解析标准 SSE

**Files:**
- Modify: `src/renderer/features/chat/hooks/useChatStream.ts`（全部约 224 行重写）

**关键接口（保持不变）:**
```typescript
export interface StreamMessage {
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
  isLoading: boolean
  error: string | null
}
```

- [ ] **Step 1: 先用 git 获取 useChatStream.ts 当前完整内容，确认最新状态**

```bash
git show HEAD:src/renderer/features/chat/hooks/useChatStream.ts | head -224
```

- [ ] **Step 2: 重写 useChatStream.ts 完整文件**

用以下内容覆盖 `src/renderer/features/chat/hooks/useChatStream.ts`：

```typescript
/**
 * Chat 流式对话 Hook
 *
 * 职责：根据 providerType 分路由到标准代理端点，消费 LLM 的流式响应。
 *
 * 架构说明：
 * - 这是唯一走 HTTP 请求的模块（非 IPC），因为 Chat 流需要经过本地 proxy 验证代理能力
 * - providerType='openai' → POST /v1/chat/completions → 解析 OpenAI SSE
 * - providerType='anthropic' → POST /v1/messages → 解析 Anthropic SSE
 * - proxy 的 handleProxyRequest 负责透明协议转换（convertRequest + convertSSEEvent）
 * - 详见 .claude/rules/00-core.md "业务 CRUD 全部走 IPC，Chat 对话流走 HTTP" 的约定
 *
 * SSE 数据消费流程：
 * 1. 通过 fetch + ReadableStream 建立持久连接
 * 2. 每个 chunk 解码后按 '\n' 分割行
 * 3. 根据端点类型解析不同的 SSE 格式：
 *    - OpenAI: 过滤 'data: ' 前缀行 → JSON.parse → delta.content / delta.reasoning_content
 *    - Anthropic: 过滤 'event: ' / 'data: ' 前缀行 → 对应事件类型解析
 * 4. content 累加到 contentAcc，thinking 累加到 thinkingAcc
 * 5. 每次更新都通过 onUpdate 回调通知父组件，父组件驱动 React 重渲染
 *
 * 中止机制：
 * - AbortController 用于中止 fetch 请求
 * - reader.cancel() 用于关闭已打开的 ReadableStream
 * - DOMException AbortError 在 catch 中被静默忽略，不触发错误状态
 */
import { useState, useRef, useCallback } from 'react'
import { apiFetch, getApiKey } from '@/shared/lib/api-client'

export interface StreamMessage {
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
  isLoading: boolean
  error: string | null
}

export function useChatStream(onUpdate: (msg: StreamMessage) => void): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const messageRef = useRef<StreamMessage | null>(null)

  /**
   * 中止当前流式请求
   * 同时中止 fetch（AbortController）和 ReadableStream（reader.cancel）
   */
  const abort = useCallback(() => {
    abortRef.current?.abort()
    readerRef.current?.cancel().catch(() => {})
    abortRef.current = null
    readerRef.current = null
    setIsLoading(false)
  }, [])

  /** 获取 SSE 端点路径 */
  function getEndpoint(providerType: 'anthropic' | 'openai'): string {
    return providerType === 'anthropic' ? '/v1/messages' : '/v1/chat/completions'
  }

  /** 构建请求体 — OpenAI 和 Anthropic 公共字段一致，Anthropic 额外需要 max_tokens */
  function buildRequestBody(model: string, messages: { role: string; content: string }[], providerType: 'anthropic' | 'openai'): string {
    const base: Record<string, any> = { model, messages, stream: true }
    if (providerType === 'anthropic') {
      base.max_tokens = 4096
    }
    return JSON.stringify(base)
  }

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

    // 发送初始消息占位，触发 UI 显示加载状态
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
      const endpoint = getEndpoint(providerType)
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: buildRequestBody(model, messages, providerType),
        signal: abortController.signal,
      })

      // 处理 HTTP 层面的错误（如 401/403/500）
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
      readerRef.current = reader

      const decoder = new TextDecoder()
      let buffer = ''
      let contentAcc = ''
      let thinkingAcc = ''
      // Anthropic SSE 使用命名事件，需追踪当前事件类型
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            // 空行在 Anthropic 中表示事件结束
            if (providerType === 'anthropic') currentEvent = ''
            continue
          }

          if (providerType === 'openai') {
            // --- OpenAI SSE 解析 ---
            // 格式: data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
            // 格式: data: [DONE]
            if (!trimmed.startsWith('data: ')) continue

            const jsonStr = trimmed.slice(6)
            if (jsonStr === '[DONE]') {
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

            let parsed: any
            try { parsed = JSON.parse(jsonStr) } catch { continue }

            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            if (delta.content) {
              contentAcc += delta.content
            }
            if (delta.reasoning_content) {
              thinkingAcc += delta.reasoning_content
            }

            const updatedMsg: StreamMessage = {
              ...messageRef.current!,
              content: contentAcc,
              thinking: thinkingAcc,
              isThinking: !!delta.reasoning_content,
            }
            messageRef.current = updatedMsg
            onUpdate(updatedMsg)

            // finish_reason 出现表示这是最后一个 chunk
            if (parsed.choices?.[0]?.finish_reason) {
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
          } else {
            // --- Anthropic SSE 解析 ---
            // 格式: event: content_block_delta
            //       data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.slice(7).trim()
              continue
            }
            if (!trimmed.startsWith('data: ')) continue

            const jsonStr = trimmed.slice(6)
            let data: any
            try { data = JSON.parse(jsonStr) } catch { continue }

            switch (currentEvent) {
              case 'content_block_start': {
                const block = data.content_block
                if (block?.type === 'text' && block.text) {
                  contentAcc += block.text
                } else if (block?.type === 'thinking' && block.thinking) {
                  thinkingAcc += block.thinking
                }
                break
              }
              case 'content_block_delta': {
                const delta = data.delta
                if (delta?.type === 'text_delta' && delta.text) {
                  contentAcc += delta.text
                } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                  thinkingAcc += delta.thinking
                }
                break
              }
              case 'message_delta': {
                // stop_reason 出现，流即将结束
                break
              }
              case 'message_stop': {
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
            }

            // 每次有内容更新时通知 UI
            const updatedMsg: StreamMessage = {
              ...messageRef.current!,
              content: contentAcc,
              thinking: thinkingAcc,
              isThinking: currentEvent === 'content_block_delta' && data.delta?.type === 'thinking_delta',
            }
            messageRef.current = updatedMsg
            onUpdate(updatedMsg)
          }
        }
      }

      // 流自然结束但未收到明确终止信号
      const doneMsg: StreamMessage = {
        ...messageRef.current!,
        content: contentAcc,
        thinking: thinkingAcc,
        isStreaming: false,
        isThinking: false,
      }
      messageRef.current = doneMsg
      onUpdate(doneMsg)
    } catch (err) {
      // AbortError 是主动中止的正常行为，不视为错误
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
      readerRef.current = null
      setIsLoading(false)
    }
  }, [onUpdate])

  return { send, abort, isLoading, error }
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit src/renderer/features/chat/hooks/useChatStream.ts 2>&1
```

Expected: 无类型错误

- [ ] **Step 4: 运行 ESLint 检查**

```bash
npx eslint src/renderer/features/chat/hooks/useChatStream.ts 2>&1
```

Expected: 无 lint 错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/chat/hooks/useChatStream.ts
git commit -m "feat: 改造 useChatStream — 按 providerType 分路由，解析标准 SSE 格式"
```

---

### Task 4: 更新 server.test.ts — 删除 /v1/chat/stream 相关测试

**Files:**
- Modify: `src/main/proxy/__tests__/server.test.ts:483-569`

- [ ] **Step 1: 删除 `POST /v1/chat/stream` 的整个 describe 块**

删除第 483-569 行的内容（从 `describe('POST /v1/chat/stream (internal renderer chat)', () => {` 开始到对应的 `})` 结束）：

```typescript
  describe('POST /v1/chat/stream (internal renderer chat)', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test-provider/gpt-4', messages: [], stream: true })
      })
      expect(res.status).toBe(401)
    })

    it('should return 501 when stream=false', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'test-provider/gpt-4', messages: [], stream: false })
      })
      expect(res.status).toBe(501)
    })

    it('should proxy and return SSE stream with ChatChunk format', async () => {
      const sseEvents = [
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]'
      ].join('\n')

      const encoded = new TextEncoder().encode(sseEvents)
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(encoded)
          controller.close()
        }
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockBody,
        headers: new Headers({ 'content-type': 'text/event-stream' })
      })

      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'test-provider/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true
        })
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')

      const text = await res.text()
      // Should contain SSE data lines with ChatChunk JSON
      expect(text).toContain('data: {')
      expect(text).toContain('"text":"Hello"')
      expect(text).toContain('"done":true')

      globalThis.fetch = originalFetch
    })

    it('should return error when API key is invalid', async () => {
      const res = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'test-provider/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true
        })
      })

      // Provider API key not configured - the provider has apiKey: 'upstream-api-key'
      // So it should work. This test verifies the auth passes.
      expect(res.status).toBe(200)
    })
  })
```

- [ ] **Step 2: 运行测试确认通过**

```bash
npx vitest run src/main/proxy/__tests__/server.test.ts 2>&1
```

Expected: 所有剩余测试 PASS（无 chat/stream 相关失败）

- [ ] **Step 3: Commit**

```bash
git add src/main/proxy/__tests__/server.test.ts
git commit -m "test: 删除 /v1/chat/stream 相关测试用例"
```

---

### Task 5: 更新测试脚本 scripts/test-chat-endpoint.ts

**Files:**
- Modify: `scripts/test-chat-endpoint.ts`（约 134 行）

- [ ] **Step 1: 重写测试脚本 — 改用 /v1/chat/completions 端点，解析标准 OpenAI SSE**

用以下内容覆盖 `scripts/test-chat-endpoint.ts`：

```typescript
/**
 * 独立测试脚本：启动 Proxy Server → 创建 API Key/Provider → 调用 /v1/chat/completions
 * 打印完整请求/响应，不依赖 Electron UI
 */
import { initDatabase, closeDatabase } from '../src/main/db/connection'
import { createTables } from '../src/main/db/schema'
import { createApiKey } from '../src/main/db/api-keys'
import { createProvider } from '../src/main/db/providers'
import { createServer } from '../src/main/proxy/server'

async function main() {
  console.log('=== Chat Endpoint 集成测试 ===\n')

  // 1. 初始化内存数据库
  await initDatabase(':memory:')
  createTables()
  console.log('[OK] 数据库初始化完成')

  // 2. 创建 API Key
  const keyResult = createApiKey('Test Key', 60)
  console.log('[OK] API Key 创建:', keyResult.plaintextKey)

  // 3. 创建 Provider (使用 mock upstream)
  createProvider({
    name: 'test-provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-upstream-key',
    models: ['gpt-4']
  })
  console.log('[OK] Provider 创建: test-provider/gpt-4')

  // 4. 创建 Proxy App
  const app = createServer()
  console.log('[OK] Proxy 服务器创建完成\n')

  // 5. 测试 1: 无鉴权 → 预期 401
  console.log('--- 测试 1: 无 Authorization 头 ---')
  const res1 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'test-provider/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })
  console.log('响应状态:', res1.status)
  const body1 = await res1.json()
  console.log('响应体:', JSON.stringify(body1))
  console.log('预期: 401 unauthorized →', res1.status === 401 ? '[PASS]' : '[FAIL]')

  // 6. 测试 2: 有效鉴权 + stream=true → 预期 200 + 标准 OpenAI SSE
  console.log('\n--- 测试 2: 有效鉴权 + stream=true ---')
  const mockSSE = [
    'data: {"id":"chatcmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
    'data: {"id":"chatcmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":"stop"}]}',
    'data: [DONE]'
  ].join('\n')
  const encoded = new TextEncoder().encode(mockSSE)

  const mockBody = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    }
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, opts: any) => {
    console.log('[Mock Fetch] URL:', typeof url === 'string' ? url : url?.toString())
    console.log('[Mock Fetch] Method:', opts?.method)
    return {
      ok: true,
      status: 200,
      body: mockBody,
      headers: new Headers({ 'content-type': 'text/event-stream' })
    } as any
  }) as any

  const res2 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${keyResult.plaintextKey}`
    },
    body: JSON.stringify({
      model: 'test-provider/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })

  console.log('响应状态:', res2.status)
  console.log('响应 Content-Type:', res2.headers.get('Content-Type'))
  const text2 = await res2.text()
  console.log('响应体 (SSE):')
  console.log(text2)
  console.log('Content-Type 是 text/event-stream:', res2.headers.get('Content-Type')?.startsWith('text/event-stream') ? '[PASS]' : '[FAIL]')
  console.log('包含 delta.content "Hello":', text2.includes('Hello') ? '[PASS]' : '[FAIL]')
  console.log('包含 [DONE] 终止信号:', text2.includes('[DONE]') ? '[PASS]' : '[FAIL]')

  globalThis.fetch = originalFetch

  // 7. 测试 3: 缺少 model → 预期 400
  console.log('\n--- 测试 3: 缺少 model 字段 ---')
  const res3 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${keyResult.plaintextKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })
  console.log('响应状态:', res3.status)
  const body3 = await res3.json()
  console.log('响应体:', JSON.stringify(body3))
  console.log('预期: 400 model is required →', res3.status === 400 ? '[PASS]' : '[FAIL]')

  closeDatabase()
  console.log('\n=== 测试完成 ===')
}

main().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
```

- [ ] **Step 2: 运行测试脚本确认通过**

```bash
npx tsx scripts/test-chat-endpoint.ts 2>&1
```

Expected: 所有测试输出 `[PASS]`，无 `[FAIL]`

- [ ] **Step 3: Commit**

```bash
git add scripts/test-chat-endpoint.ts
git commit -m "test: 更新 test-chat-endpoint 脚本改用 /v1/chat/completions"
```

---

### Task 6: 更新文档

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `.claude/rules/20-directory.md`
- Modify: `.claude/rules/40-api.md`
- Modify: `.claude/rules/00-core.md`

- [ ] **Step 1: 更新 docs/ARCHITECTURE.md — 删除 chat domain 相关描述**

需要修改 6 处：

**a) 目录结构部分（第 71-74 行）** — 删除 chat domain 目录项：
```
│   │   │   └── chat/
│   │   │       ├── chat.types.ts        # 聊天请求/响应类型
│   │   │       ├── chat.service.ts      # 聊天业务（SSE 流读取）
│   │   │       └── chat.stream.ts       # SSE 响应构造器
```
替换为：删除这 4 行。

**b) 目录结构部分（第 117 行）** — 删除 features 下的 `features/chat/*` 引用（如有独立引用）：
```
│  │  pages/*         │  │  queries/*      │  │  features/chat/* │   │
```
保持不变（features/chat 仍然存在，只是 hooks 内部实现改了）。

**c) Chat 流式数据流（第 204-234 行）** — 更新调用链图：
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

**d) 路由表（第 319 行）** — 删除 `/v1/chat/stream` 行：
```
| `/v1/chat/stream` | POST | 内部聊天 SSE 流（ChatChunk 格式） |
```
替换为：删除这行。

**e) chat domain 描述（第 403-412 行）** — 删除整个 "chat domain：" 节：
```
**chat domain：**
- `chat.service.ts` 核心聊天逻辑：
  1. `verifyApiKey()` 验证 Gateway API Key
  2. `resolveProvider(model)` 查找供应商
  3. `buildProxyUrl/Headers()` 构建上游请求
  4. `fetch()` 发送流式请求
  5. 逐行解析 SSE（支持 OpenAI `data: {choices[0].delta}` 和 Anthropic 事件格式）
  6. 以 `AsyncGenerator` 形式逐个 yield `ChatChunk`（支持 thinking/text 两种类型）
- `chat.stream.ts` 将 AsyncGenerator 转换为 SSE Response：
  - 创建 ReadableStream，逐 chunk 序列化为 `data: JSON\n\n`
```
替换为：删除这 10 行。

**f) 关键数据格式 — ChatChunk（第 609-618 行）** — 删除 ChatChunk 节：
```
### 7.1 ChatChunk（内部 SSE 格式）

```typescript
interface ChatChunk {
  text: string              // 文本片段
  chunkType?: 'thinking' | 'text'  // 类型
  done: boolean             // 是否结束
  error?: string            // 错误信息
}
```
```
替换为：删除这 10 行。

- [ ] **Step 2: 更新 .claude/rules/20-directory.md — 删除 chat domain 目录项和 /v1/chat/stream 引用**

**a) 第 25 行** — 删除 `/v1/chat/stream`：
```
│   │   ├── server.ts          # Hono 应用 + 代理端点 + /v1/chat/stream
```
替换为：
```
│   │   ├── server.ts          # Hono 应用 + 代理端点
```

**b) 第 68 行** — 更新 chat 例外说明（保留 features/chat 引用，因为 features/chat 目录仍然存在）：
```
  例外：features/chat/hooks/useChatStream → shared/lib/api-client.ts → HTTP (8080) → proxy
```
保持不变（这行仍然正确，只是端点变了）。

- [ ] **Step 3: 确认 .claude/rules/40-api.md 无需修改**

第 11 行当前内容：
```
- 代理类：`/v1/chat/completions`（OpenAI 格式）、`/v1/messages`（Anthropic 格式）
```
已经不包含 `/v1/chat/stream`，无需修改。

- [ ] **Step 4: 确认 .claude/rules/00-core.md 无需修改**

当前规则仍然正确：
```
- 业务数据 CRUD 走 HTTP（唯一例外：Chat 对话流走代理 HTTP 8080 验证代理能力）
- `shared/lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD
```
无需修改。

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md .claude/rules/20-directory.md
git commit -m "docs: 更新文档 — 删除 chat domain 和 /v1/chat/stream 引用"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 运行全量 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1
```

Expected: 无错误

- [ ] **Step 2: 运行全量 ESLint**

```bash
npx eslint src/ 2>&1
```

Expected: 无错误

- [ ] **Step 3: 运行全量测试**

```bash
npx vitest run 2>&1
```

Expected: 所有测试 PASS

- [ ] **Step 4: Commit（如上述步骤发现并修复了问题）**

```bash
git add -A
git commit -m "chore: 全量编译/测试验证通过"
```
