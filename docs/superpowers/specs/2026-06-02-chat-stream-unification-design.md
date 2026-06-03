# Chat 流端点统一 — 删除 /v1/chat/stream，统一走代理端点

**日期**: 2026-06-02
**状态**: 待实施

## 背景

当前 Chat 功能存在两条独立的 HTTP 代理路径：

| 路径 | 端点 | 协议转换 | 调用方 |
|------|------|----------|--------|
| 外部代理 | `POST /v1/chat/completions` + `POST /v1/messages` | ✅ `convertRequest` + `convertSSEEvent` + `convertResponse` | 外部客户端 |
| 内部 Chat | `POST /v1/chat/stream` | ❌ 无，硬编码按 providerType 分支解析 | `useChatStream.ts`（渲染进程） |

内部路径的问题：
1. **缺少协议转换**：当客户端格式（如 OpenAI）与上游供应商格式（如 Anthropic）不一致时，请求体和 SSE 流都不会被转换，导致上游不认识请求字段、客户端解析不了响应
2. **代码重复**：`chat.service.ts` 手写了一套 fetch + SSE 解析逻辑，与 `handleProxyRequest` 功能高度重叠
3. **自定义格式**：内部路径使用自定义 `ChatChunk` 格式（`{text, chunkType, done, error}`），与标准 SSE 格式不兼容

## 目标

1. 删除 `src/main/domains/chat/` 整个目录（`chat.service.ts` / `chat.stream.ts` / `chat.types.ts`）
2. 删除 `server.ts` 中 `POST /v1/chat/stream` 路由及相关 import
3. 改造 `useChatStream.ts`，根据 providerType 分路由调用标准代理端点，解析标准 SSE 格式
4. 删除相关测试用例，更新测试脚本
5. 全面更新文档

## 设计决策

### useChatStream 按 providerType 分路由（方案 A）

用户选择 providerType 参数来路由：

```
providerType === 'openai'   → POST /v1/chat/completions  → 解析 OpenAI SSE
providerType === 'anthropic' → POST /v1/messages           → 解析 Anthropic SSE
```

**关键优势**：proxy 的 `handleProxyRequest` 已具备完整的双向协议转换能力。当 providerType 与上游供应商类型不匹配时（如用户传 anthropic 格式但上游是 OpenAI），proxy 自动执行 `convertRequest` + `convertSSEEvent`。useChatStream 始终按 providerType 对应的格式解析，无需感知底层供应商。

### 保留 Thinking 支持

两种格式均保留 thinking/reasoning 内容展示：

- **OpenAI SSE**：`delta.reasoning_content` 字段
- **Anthropic SSE**：`content_block_delta` 事件中 `delta.type === 'thinking_delta'` 的 `delta.thinking` 字段

### 全面更新文档

包括 `docs/ARCHITECTURE.md`、所有 `.claude/rules/` 规则文件、`docs/superpowers/` 下的设计文档。

## 实施步骤

### Step 1: 删除 chat domain 目录

```
删除 src/main/domains/chat/chat.service.ts
删除 src/main/domains/chat/chat.stream.ts
删除 src/main/domains/chat/chat.types.ts
删除 src/main/domains/chat/ 目录
```

### Step 2: 清理 server.ts

**删除 import**：
```typescript
import { createChatService } from '../domains/chat/chat.service'
import { createSSEResponse } from '../domains/chat/chat.stream'
```

**删除路由**（约 14 行）：
```typescript
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

### Step 3: 改造 useChatStream.ts

**变更要点**：
1. `send()` 方法根据 providerType 选择端点路径和 SSE 解析策略
2. 请求体格式匹配端点（OpenAI 用 `{model, messages, stream}`，Anthropic 用 `{model, messages, stream, max_tokens}`）
3. 解析标准 SSE 格式替代自定义 ChatChunk 格式
4. 维持现有 `StreamMessage` 接口不变（`content` / `thinking` / `isThinking` / `isStreaming` / `error`）

**OpenAI SSE 解析逻辑**：
```
data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
  → delta.content → content 累加
  → delta.reasoning_content → thinking 累加
  → finish_reason 非 null → 流结束
data: [DONE]
  → 终止信号
```

**Anthropic SSE 解析逻辑**：
```
event: content_block_start
data: {"content_block":{"type":"text","text":"Hello"}}
  → content 累加

event: content_block_delta
data: {"delta":{"type":"text_delta","text":" world"}}
  → content 累加

event: content_block_delta
data: {"delta":{"type":"thinking_delta","thinking":"Let me think"}}
  → thinking 累加

event: message_delta
data: {"delta":{"stop_reason":"end_turn"}}
  → 流即将结束

event: message_stop
  → 流结束
```

### Step 4: 更新测试

**server.test.ts**：删除 `POST /v1/chat/stream` 相关 describe 块（约 90 行）

**scripts/test-chat-endpoint.ts**：改造为调用标准代理端点

### Step 5: 更新文档

更新以下文件中的 chat domain 和 `/v1/chat/stream` 引用：
- `docs/ARCHITECTURE.md`
- `.claude/rules/00-core.md`
- `.claude/rules/20-directory.md`
- `.claude/rules/40-api.md`
- `.claude/rules/31-renderer.md`（如涉及）

## 影响范围

### 删除的文件（3 个）
- `src/main/domains/chat/chat.service.ts`（187 行）
- `src/main/domains/chat/chat.stream.ts`（35 行）
- `src/main/domains/chat/chat.types.ts`（23 行）

### 修改的文件（约 10 个）
- `src/main/proxy/server.ts` — 删除 import 和路由（约 -20 行）
- `src/renderer/features/chat/hooks/useChatStream.ts` — 重写 SSE 解析（~100 行改动）
- `src/main/proxy/__tests__/server.test.ts` — 删除 chat/stream 测试（约 -90 行）
- `scripts/test-chat-endpoint.ts` — 改造端点调用
- `docs/ARCHITECTURE.md` — 删除 chat domain 描述
- `.claude/rules/20-directory.md` — 删除 chat domain 目录项
- `.claude/rules/40-api.md` — 删除 `/v1/chat/stream` 端点
- `.claude/rules/00-core.md` — 确认是否涉及
- `docs/superpowers/specs/2026-05-30-architecture-refactoring-design.md` — 更新引用
- `docs/superpowers/plans/2026-05-30-architecture-refactoring.md` — 更新引用

## 风险

- **低风险**：删除的是仅被一条调用链使用的代码，无外部依赖
- `useChatStream.ts` 的 `send()` 方法签名需保持向后兼容（`model, providerType, messages` → `onUpdate(StreamMessage)`）
- SSE 解析需要处理跨 chunk 断行和异常 JSON 的容错
