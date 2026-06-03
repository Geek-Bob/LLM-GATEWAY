# Chat UI 层统一 OpenAI 协议 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 useChatStream.ts 中 Anthropic SSE 解析分支，UI 层统一走 OpenAI 协议，依赖后端 proxy 做双向协议转换。

**Architecture:** 精简 useChatStream — 固定 POST /v1/chat/completions 端点 + 单一 OpenAI SSE 解析器；Chat.tsx 不再传递 providerType 参数；Chat.test.tsx 删除 Anthropic mock 测试。纯删减重构，无新功能。

**Tech Stack:** TypeScript, React Hooks, Vitest + jsdom

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/renderer/features/chat/hooks/useChatStream.ts` | 核心精简 — 移除 providerType 参数和 Anthropic SSE 解析 |
| 修改 | `src/renderer/pages/Chat.tsx` | 移除 send() 调用的 providerType 参数 |
| 修改 | `src/renderer/pages/__tests__/Chat.test.tsx` | 删除 Anthropic SSE 测试用例 |
| 修改 | `src/renderer/components/ChatMessage.tsx` | 注释更新（Anthropic → 通用描述） |

---

### Task 1: 精简 useChatStream.ts — 移除 Anthropic 分支

**Files:**
- Modify: `src/renderer/features/chat/hooks/useChatStream.ts`（317 → ~190 行）

- [ ] **Step 1: 删除 send() 的 providerType 参数**

当前 L41:
```typescript
  send: (model: string, providerType: 'anthropic' | 'openai', messages: { role: string; content: string }[]) => Promise<void>
```
改为:
```typescript
  send: (model: string, messages: { role: string; content: string }[]) => Promise<void>
```

- [ ] **Step 2: 删除 getEndpoint() 函数**

当前 L66-69:
```typescript
  function getEndpoint(providerType: 'anthropic' | 'openai'): string {
    return providerType === 'anthropic' ? '/v1/messages' : '/v1/chat/completions'
  }
```
删除整个函数。

- [ ] **Step 3: 删除 buildRequestBody() 中 Anthropic max_tokens 条件**

当前 L72-83:
```typescript
  function buildRequestBody(
    model: string,
    messages: { role: string; content: string }[],
    providerType: 'anthropic' | 'openai'
  ): string {
    const body: Record<string, any> = { model, messages, stream: true }
    if (providerType === 'anthropic') {
      body.max_tokens = 4096
    }
    return JSON.stringify(body)
  }
```
改为:
```typescript
  function buildRequestBody(
    model: string,
    messages: { role: string; content: string }[]
  ): string {
    const body: Record<string, any> = { model, messages, stream: true }
    return JSON.stringify(body)
  }
```

- [ ] **Step 4: 更新 send() 回调签名和函数体 — 固定端点**

当前 L95-99:
```typescript
  const send = useCallback(async (
    model: string,
    providerType: 'anthropic' | 'openai',
    messages: { role: string; content: string }[]
  ) => {
```
改为:
```typescript
  const send = useCallback(async (
    model: string,
    messages: { role: string; content: string }[]
  ) => {
```

- [ ] **Step 5: 固定端点路径**

当前 L126:
```typescript
      const endpoint = getEndpoint(providerType)
```
改为:
```typescript
      const endpoint = '/v1/chat/completions'
```

- [ ] **Step 6: 固定 buildRequestBody 调用**

当前 L129:
```typescript
        body: buildRequestBody(model, messages, providerType),
```
改为:
```typescript
        body: buildRequestBody(model, messages),
```

- [ ] **Step 7: 删除 currentEvent 变量**

当前 L157-158:
```typescript
      let currentEvent = ''
```
删除这行，同时删除下方 L165 `buffer = lines.pop() || ''` 之后的 currentEvent 相关代码。

- [ ] **Step 8: 删除 Anthropic SSE 解析 else 分支，保留 OpenAI 解析**

当前 L168-283 是完整的 SSE 循环体，需要重构：

需删除的代码范围（L169-283 中的 Anthropic 部分）：
- L171-174: Anthropic currentEvent 空行重置
- L176 的 `if (providerType === 'openai') {` 外层条件
- L219-282: 整个 Anthropic SSE 解析 `else` 分支

重构后的 SSE 循环体：

```typescript
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          // --- OpenAI SSE 解析 ---
          // 格式: data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
          // 格式: data: [DONE]
          if (!trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') {
            const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
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

          // finish_reason 出现表示这是最后一个有意义 chunk
          if (parsed.choices?.[0]?.finish_reason) {
            const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
            messageRef.current = doneMsg
            onUpdate(doneMsg)
            return
          }
        }
      }
```

- [ ] **Step 9: 更新文件头注释**

当前 L3-26 的注释块中删除 Anthropic 相关内容：

当前 L4, L8-9, L17-18:
```typescript
 * 职责：根据 providerType 分路由到标准代理端点，消费 LLM 的流式响应。
...
 * - providerType='openai' → POST /v1/chat/completions → 解析 OpenAI SSE
 * - providerType='anthropic' → POST /v1/messages → 解析 Anthropic SSE
...
 *    - Anthropic: 过滤 'event: ' / 'data: ' 前缀行 → 对应事件类型解析
```
改为:
```typescript
 * 职责：调用标准代理端点 /v1/chat/completions，消费 OpenAI 格式的 SSE 流式响应。
 * 后端 proxy 自动处理与上游供应商（Anthropic 等）的协议转换，前端无需感知。
...
 * 2. 每个 chunk 解码后按 '\n' 分割行
 * 3. 解析 OpenAI SSE 格式：
 *    - 过滤 'data: ' 前缀行 → JSON.parse → delta.content / delta.reasoning_content
```

- [ ] **Step 10: 运行 TypeScript 编译检查，确认无类型错误**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: 无错误（或仅有预先存在的无关错误）

- [ ] **Step 11: Commit**

```bash
git add src/renderer/features/chat/hooks/useChatStream.ts
git commit -m "refactor: useChatStream 移除 Anthropic SSE 解析分支，统一走 OpenAI 协议"
```

---

### Task 2: 精简 Chat.tsx — 移除 providerType 参数

**Files:**
- Modify: `src/renderer/pages/Chat.tsx:167-168, 186-187`

- [ ] **Step 1: 更新 handleSend() 中的 send() 调用**

当前 L167-171:
```typescript
    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, selectedProvider.providerType, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content }
    ])
```
改为:
```typescript
    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content }
    ])
```

- [ ] **Step 2: 更新 handleRegenerate() 中的 send() 调用**

当前 L185-188:
```typescript
    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, selectedProvider.providerType, apiMessages)
    setMessages((prev) => prev.slice(0, -1))
```
改为:
```typescript
    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, apiMessages)
    setMessages((prev) => prev.slice(0, -1))
```

- [ ] **Step 3: 更新注释**

当前 L45:
```typescript
  thinking?: string       /** 模型的思考过程（如 Anthropic 的 extended thinking） */
```
改为:
```typescript
  thinking?: string       /** 模型的思考过程（如 extended thinking） */
```

- [ ] **Step 4: 运行 TypeScript 编译检查**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Chat.tsx
git commit -m "refactor: Chat.tsx 移除 send() 的 providerType 参数"
```

---

### Task 3: 更新 ChatMessage.tsx 注释

**Files:**
- Modify: `src/renderer/components/ChatMessage.tsx:7`

- [ ] **Step 1: 更新注释中的 Anthropic 引用**

当前 L7:
```typescript
  thinking?: string          /** 模型的思考过程文本 */
```
改为（如果当前 L7 已不是 Anthropic 引用，跳过此步骤；根据 grep 结果仅 L7 有 "Anthropic extended thinking"，已在注释中）：

验证：L7 的注释为 `thinking?: string          /** 模型的思考过程文本 */`，不包含 Anthropic 引用。查看 grep 结果，文件头注释 L7 处有 `Anthropic extended thinking`：

当前文件头注释中：
```typescript
 * - thinking: 模型的思考过程（Anthropic extended thinking），可折叠
```
改为:
```typescript
 * - thinking: 模型的思考过程（extended thinking），可折叠
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/ChatMessage.tsx
git commit -m "docs: ChatMessage 注释移除 Anthropic 特定引用"
```

---

### Task 4: 更新 Chat.test.tsx — 删除 Anthropic SSE 测试

**Files:**
- Modify: `src/renderer/pages/__tests__/Chat.test.tsx:554-597`

- [ ] **Step 1: 删除 Anthropic 专属测试用例**

删除 L554-597 的整个测试用例：
```typescript
  // ─── Provider type routing ────────────────────

  it('uses apiFormat: anthropic for anthropic provider', async () => {
    _providerList.mockResolvedValue([
      { ...mockProvider, name: 'AnthropicTest', providerType: 'anthropic', models: ['claude-3'] },
    ])
    await renderChat()

    await selectByIndex(0, 'AnthropicTest')
    await selectByIndex(1, 'claude-3')
    await selectByIndex(2, 'My Key')

    // Mock Anthropic SSE 格式
    const sseLines = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1"}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"Anthropic response"}}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ].join('\n')
    const encoded = new TextEncoder().encode(sseLines)
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoded); controller.close() }
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: stream,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })
    globalThis.fetch = mockFetch
    typeAndSend('Hi')
    await screen.findByText('Anthropic response')
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/messages')
    expect(JSON.parse(opts.body).model).toBe('AnthropicTest/claude-3')
  })
```

- [ ] **Step 2: 确认测试文件 import 无需调整**

useChatStream 的 `StreamMessage` 接口未变，`send()` 从 `useChatStream` 解构出来的调用方式不变。确认 `ChatPage` 导入 `useChatStream` 的 `import` 语句无需修改。

- [ ] **Step 3: 运行 Chat 测试套件验证**

Run: `npx vitest run src/renderer/pages/__tests__/Chat.test.tsx`
Expected: 所有剩余测试通过（约减少 1 个测试用例，其余 20+ 全部 PASS）

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/__tests__/Chat.test.tsx
git commit -m "test: 删除 Anthropic SSE mock 测试用例，统一 OpenAI mock"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 运行全量测试**

```bash
npx vitest run
```
Expected: 全部测试通过，无 regression

- [ ] **Step 2: 运行 ESLint**

```bash
npx eslint src/renderer/features/chat/ src/renderer/pages/Chat.tsx src/renderer/pages/__tests__/Chat.test.tsx src/renderer/components/ChatMessage.tsx
```
Expected: 无新增 lint 错误

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit --project tsconfig.json
```
Expected: 无类型错误

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: 全量验证通过 — Chat UI 层统一 OpenAI 协议"
```
