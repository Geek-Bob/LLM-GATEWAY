# Chat UI 层统一 OpenAI 协议 — 移除 Anthropic SSE 解析分支

**日期**: 2026-06-02
**状态**: 待实施
**依赖**: `2026-06-02-chat-stream-unification-design.md`（chat domain 已删除，useChatStream 已走代理端点）

## 背景

在上一个设计 `2026-06-02-chat-stream-unification` 中，`useChatStream.ts` 实现了按 `providerType` 分路由的双协议方案：

```
providerType === 'openai'   → /v1/chat/completions  → 解析 OpenAI SSE
providerType === 'anthropic' → /v1/messages           → 解析 Anthropic SSE
```

但后端 `converter.ts`（1396 行）已具备完整的 OpenAI↔Anthropic **双向协议转换**能力：
- `convertRequest` — 请求体双向转换
- `convertSSEStream` — SSE 流式事件双向转换
- `convertResponse` — 非流式响应双向转换

这意味着：**UI 层只需发 OpenAI 格式 + 解析 OpenAI SSE，后端自动处理与 Anthropic 供应商的协议差异**。当前前端双协议分支是冗余的。

## 目标

1. `useChatStream.ts` 移除 `providerType` 参数和 Anthropic SSE 解析分支，固定走 OpenAI 格式
2. `Chat.tsx` 中 `send()` 调用移除 `providerType` 参数
3. `Chat.test.tsx` 删除 Anthropic SSE mock 测试，统一 OpenAI mock
4. 注释中的 Anthropic 引用改为通用描述

## 设计决策

### 统一端点与格式

```
Before:
  send("anthropic/claude-4", "anthropic", messages)
    → POST /v1/messages
    → 解析 Anthropic SSE (event: content_block_delta / data: ...)

  send("openai/gpt-4", "openai", messages)
    → POST /v1/chat/completions
    → 解析 OpenAI SSE (data: {...})

After:
  send("anthropic/claude-4", messages)  // 不传 providerType
    → POST /v1/chat/completions         // 固定 OpenAI 端点
    → 解析 OpenAI SSE                    // 固定 OpenAI 解析器
    → 后端 proxy 自动识别上游是 Anthropic，执行协议转换
```

### Thinking 支持不受影响

当前 OpenAI SSE 解析已支持 `delta.reasoning_content`（useChatStream.ts L199-201）。后端 converter 将 Anthropic `thinking_delta` → OpenAI `reasoning_content`，前端无需感知。

### 请求体简化

移除 `buildRequestBody` 中 `max_tokens` 条件分支。后端 converter 在 `openaiToAnthropicRequest` 中已处理 `max_tokens` 默认值（`max_tokens ?? max_completion_tokens ?? 4096`）。

## 改动清单

### 1. `useChatStream.ts`（317→~190 行，-40%）

| 删除项 | 行数 |
|--------|------|
| `send()` 的 `providerType` 参数 + 类型 | ~3 |
| `getEndpoint()` 函数 | 3 |
| `buildRequestBody()` 中 `max_tokens` 条件 | 3 |
| `currentEvent` 变量 + 空行重置逻辑 | 5 |
| Anthropic SSE 解析 `else` 分支（event/content_block_start/content_block_delta/message_delta/message_stop） | ~65 |
| 相关注释更新 | ~3 |

保留项：
- `StreamMessage` 接口（不变）
- OpenAI SSE 解析（`data:` 前缀 → JSON.parse → delta.content / delta.reasoning_content）
- `[DONE]` 终止信号 + `finish_reason` 检测
- AbortController + ReadableStream 管理
- 错误处理 + AbortError 静默忽略

### 2. `Chat.tsx`（-4 行）

- `handleSend()`: `send(modelFull, selectedProvider.providerType, messages)` → `send(modelFull, messages)`
- `handleRegenerate()`: 同上移除 `providerType` 参数

### 3. `Chat.test.tsx`（-42 行）

- 删除测试用例 `'uses apiFormat: anthropic for anthropic provider'`（L556-597）
- 其余测试均使用 `mockOpenAISSEStream`，无需改动

### 4. 注释更新

| 文件 | 变更 |
|------|------|
| `Chat.tsx` L45 | "如 Anthropic 的 extended thinking" → "如 extended thinking" |
| `ChatMessage.tsx` L7 | "Anthropic extended thinking" → "extended thinking" |

## 不影响的部分

- **`Provider.providerType`** — Providers 管理页仍需要此字段，用户配置供应商类型
- **后端 `converter.ts`** — 协议转换逻辑完整保留，不动
- **后端 `server.ts`** — `/v1/chat/completions` + `/v1/messages` 两个端点均保留
- **`lib/types.ts`** — `providerType: 'anthropic' | 'openai'` 类型保留
- **`preload/types.ts`** — IPC 桥接类型保留

## 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Thinking 功能回退 | **低** | 当前 OpenAI SSE 解析已处理 `reasoning_content`；后端 `converter.ts` 有完整测试覆盖 |
| 跨 chunk 断行 | **低** | 保留现有 buffer 逻辑，仅删除 Anthropic 分支 |
| 测试覆盖缺口 | **低** | 删除 1 个测试，其余 20+ 测试走 OpenAI mock 覆盖全部路径 |

## 影响范围

| 文件 | 改动量 |
|------|--------|
| `src/renderer/features/chat/hooks/useChatStream.ts` | -127 行 |
| `src/renderer/pages/Chat.tsx` | -4 行 |
| `src/renderer/pages/__tests__/Chat.test.tsx` | -42 行 |
| `src/renderer/components/ChatMessage.tsx` | 注释 1 处 |
| **总计** | **约 -174 行** |
