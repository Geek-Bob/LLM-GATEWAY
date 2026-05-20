# 协议自动转换 (OpenAI ⇄ Anthropic)

**日期**: 2026-05-20  
**状态**: 已定稿  
**目标**: 代理服务器自动检测请求格式与供应商类型不匹配时，自动转换请求/响应的协议格式

## 动机

当前代理路由是硬编码的：`POST /v1/chat/completions` 永远发 OpenAI 格式到上游，`POST /v1/messages` 永远发 Anthropic 格式到上游。如果供应商只支持另一种协议，请求直接失败。

## 触发条件

`apiFormat` (请求的协议) !== `provider.providerType` (供应商支持的协议) → 自动转换。零配置，无需用户开关。

## 架构

```
src/main/proxy/
├── server.ts           ← handleProxyRequest 加转换判断 (~30行改动)
├── forwarder.ts        ← 不变 (path 由 converter 返回)
├── router.ts           ← 不变
├── converter.ts        ← 新增: 核心转换模块 (~500行)
└── __tests__/
    └── converter.test.ts ← 新增: converter 单测
```

**数据流**:
```
客户端 Anthropic 请求 → server.ts → resolveProvider(providerType=openai)
  → needsConversion = true
  → convertRequest(body, 'anthropic' → 'openai')
  → { body: OpenAI格式, path: '/v1/chat/completions' }
  → fetch 上游 OpenAI 端点
  → convertResponse/convertSSEEvent(response, 'openai' → 'anthropic')
  → 返回 Anthropic 格式给客户端
```

## 模块设计

### converter.ts 导出

```typescript
// 请求
function convertRequest(body: any, from: 'openai'|'anthropic', to): { body: any; path: string }

// 非流式响应
function convertResponse(body: any, from: 'openai'|'anthropic', to): any

// 流式 SSE (逐事件)
function convertSSEEvent(event: string, data: any, from: 'openai'|'anthropic', to): { event: string; data: any } | null

// Stop/Finish reason 映射
function mapFinishReason(reason: string, direction: 'toOpenAI'|'toAnthropic'): string
```

### 内部函数结构

```
convertRequest
  ├─ openaiToAnthropicRequest(body)  — 请求体 O→A
  │   ├─ 基础字段 (model, temp, max_tokens, top_p, top_k, stream, service_tier)
  │   ├─ 消息重排 (相邻同角色合并，首条必须 user)
  │   ├─ System prompt 抽取 (messages[role=system] → request.system 数组)
  │   ├─ Tools 转换 (Function.parameters → Tool.inputSchema)
  │   ├─ Tool choice 映射 (auto/required/none → auto/any/none + disable_parallel_tool_use)
  │   ├─ Web search (web_search_options → web_search_20250305 tool)
  │   ├─ Reasoning effort → Thinking (low/med/high → budgetTokens 1280/2048/4096)
  │   ├─ Response format (json_object → system prompt; json_schema → tool + tool_choice)
  │   ├─ Stop sequences (stop string/array → stop_sequences[])
  │   ├─ cache_control 透传 (Anthropic content block 缓存标记原样保留)
  │   └─ 移除不兼容字段 (n, frequency_penalty, presence_penalty, seed, logprobs, logit_bias, stream_options)
  │
  └─ anthropicToOpenAIRequest(body)  — 请求体 A→O
      ├─ 基础字段 (model, temp, max_tokens, top_p, top_k, stream)
      ├─ System 字段 → messages.unshift(role=system)
      ├─ Messages 转换 (content array → string 或 media_content[])
      ├─ Tools 转换 (inputSchema → parameters)
      ├─ Thinking → reasoning_effort / reasoning (OpenRouter兼容)
      ├─ 消息内 tool_use → tool_calls
      ├─ 消息内 tool_result → role=tool 消息
      ├─ Web search tool → web_search_options
      └─ Stop sequences (stop_sequences → stop string/array)

convertResponse
  ├─ anthropicToOpenAIResponse(body)  — 非流式 C→O
  │   ├─ content[] 遍历: text→content, tool_use→tool_calls, thinking→reasoning_content
  │   ├─ stop_reason → finish_reason
  │   └─ usage (input_tokens→prompt_tokens, output_tokens→completion_tokens)
  │
  └─ openAIToAnthropicResponse(body)  — 非流式 O→C
      ├─ choices → content[] (text/tool_use)
      ├─ finish_reason → stop_reason
      └─ usage 反向映射

convertSSEEvent
  ├─ anthropicSSEToOpenAI(event, data)  — 流式 C→O
  │   ├─ message_start → id, model, role:assistant delta
  │   ├─ content_block_start(text) → 首段 text delta
  │   ├─ content_block_start(tool_use) → ToolCallResponse(id, name, index)
  │   ├─ content_block_start(thinking) → reasoning_content delta
  │   ├─ content_block_delta(text_delta) → text delta
  │   ├─ content_block_delta(input_json_delta) → tool call arguments delta
  │   ├─ content_block_delta(thinking_delta) → reasoning_content delta
  │   ├─ content_block_delta(signature_delta) → reasoning_content newline
  │   ├─ message_delta → finish_reason + usage
  │   └─ message_stop → null (不发)
  │
  └─ openAISSEToAnthropic(event, data)  — 流式 O→C
      ├─ 首个 chunk → message_start (含估算 input_tokens)
      ├─ reasoning delta → thinking content_block_start + thinking_delta
      ├─ text delta → text content_block_start + text_delta
      ├─ tool_calls delta → tool_use content_block_start + input_json_delta
      ├─ finish_reason → message_delta (stop_reason + usage) + message_stop
      └─ 状态机跟踪 (ClaudeConvertInfo: LastMessagesType, Index, ToolCallBaseIndex, ToolCallMaxIndexOffset)
```

### Stop/Finish Reason 映射表

参照 new-api `reasonmap.go`:

| Claude stop_reason | OpenAI finish_reason |
|---|---|
| end_turn | stop |
| stop_sequence | stop |
| max_tokens | length |
| tool_use | tool_calls |
| refusal | content_filter |

双向对称映射。

### Response Format 转换

OpenAI 的 `response_format` 在 Anthropic 中无直接对应，用组合策略：

```
OpenAI → Anthropic:
  response_format: { type: "json_object" }
    → system prompt 追加 "\nYou must respond with valid JSON only. Do not wrap in markdown."
  
  response_format: { type: "json_schema", json_schema: { name, schema, strict } }
    → 转为 tool，设置 tool_choice: { type: "tool", name: <json_schema.name> }
    → 模型会调用该 tool，参数就是符合 schema 的 JSON

Anthropic → OpenAI:
  检测 system prompt 中包含 "json" / "valid JSON" 关键词
    → 设置 response_format: { type: "json_object" }
  检测有 tool 且 tool_choice 指定了某个 tool
    → 设置 response_format: { type: "json_schema", json_schema: { name, schema } }
```

### 超越 new-api 的差异化

new-api 是服务端网关 (Go)，我们是客户端桌面应用 (TypeScript/Electron)，天然优势：

| 能力 | new-api | 我们 |
|------|:--:|:--:|
| OpenAI ⇄ Anthropic 全量转换 | ✅ | ✅ |
| response_format 双向转换 | ❌ | ✅ |
| 转换过程可视化 (Dashboard 可查看转换日志) | ❌ | ✅ |
| 离线/本地运行，无服务端依赖 | ❌ | ✅ |
| TypeScript 类型安全 (编译期检查协议字段) | ❌ | ✅ |
| 单文件 converter 可独立复用 (可被其他项目 import) | ❌ | ✅ |

### OpenAISSEToAnthropic 流式状态机

参照 new-api `convert.go:StreamResponseOpenAI2Claude` 的 `ClaudeConvertInfo` 模式:

```typescript
interface StreamState {
  lastMessagesType: 'none' | 'text' | 'thinking' | 'tools'
  index: number                    // 当前 content block index
  toolCallBaseIndex: number        // 并行 tool call 起始 index
  toolCallMaxIndexOffset: number   // 并行 tool call 最大偏移
  done: boolean
  finishReason: string
}
```

关键规则:
- 切换 block 类型前必须 `content_block_stop` 当前 block
- 并行 tool call 按 index 偏移管理多个 block
- `message_delta` 只在收到 finish_reason 后才发
- 用 `[DONE]` 信号触发最终清理

### server.ts 集成

`handleProxyRequest` 中:

```typescript
const needsConversion = apiFormat !== route.provider.providerType

let proxyPath = path
let proxyBody = { ...body, model: route.modelName }

if (needsConversion) {
  const result = convertRequest(proxyBody, apiFormat, route.provider.providerType)
  proxyBody = result.body
  proxyPath = result.path
}

// 流式: tee 后逐行调 convertSSEEvent 转换 SSE 事件再写客户端
// 非流式: 收到响应后调 convertResponse 再返回
// token usage 提取: 始终从最终返回给客户端的响应格式里取
```

### 错误响应转换

上游错误响应也需要转换，否则客户端无法解析：

```
Anthropic 错误格式:                    OpenAI 错误格式:
{                                     {
  "type": "error",                      "error": {
  "error": {                              "type": "invalid_request_error",
    "type": "invalid_request_error",       "message": "模型不存在",
    "message": "模型不存在"                 "code": "model_not_found"
  }                                      }
}                                     }

OpenAI 错误 → Anthropic:
  error.message → error.error.message
  error.type   → error.error.type

Anthropic 错误 → OpenAI:
  error.error.message → error.message
  error.error.type    → error.type
```

### 流式结束信号映射

| 方向 | 源格式 | 目标格式 |
|------|--------|----------|
| C→O | `event: message_stop` | `data: [DONE]` |
| O→C | `data: [DONE]` | `event: message_stop` |

### Header 转换

`forwarder.ts` 按 `provider.providerType` 添加/剥离协议特有 HTTP 头。转换场景下需更细粒度控制：

```
O→A 转换:
  NOP: bearer token (统一用 Authorization: Bearer)
  添加: anthropic-version: 2023-06-01
  透传: anthropic-beta (客户端显式发送的 beta 头保留)
  移除: OpenAI 特有头 (已隐式处理，因为我们发到 Anthropic 端点)

A→O 转换:
  移除: anthropic-version, anthropic-beta
  NOP: bearer token 不变
```

### 不兼容字段处置

OpenAI 特有字段在 O→A 转换时直接移除，不做翻译：

| 字段 | 处置 | 原因 |
|------|------|------|
| `n` | 移除，n>1 时 console.warn | Anthropic 不支持多补全 |
| `frequency_penalty` | 移除 | 无等价参数 |
| `presence_penalty` | 移除 | 无等价参数 |
| `logprobs` | 移除 | 无等价参数 |
| `top_logprobs` | 移除 | 无等价参数 |
| `seed` | 移除 | 无等价参数 |
| `logit_bias` | 移除 | 无等价参数 |
| `stream_options` | 移除 | Anthropic 流式选项不同 |
| `service_tier` | **透传** | 双方都支持 |

### 边界情况处理

| 情况 | 处理 |
|------|------|
| 空消息 content | 替换为 `"..."` |
| 相邻同角色消息 | 合并为一条 |
| 首条消息非 user | 插入 `{role: "user", content: "..."}` 占位 |
| 未知 SSE 事件类型 | 丢弃不转发 |
| 缺失 usage 字段 | 设 0，不报错 |
| 透传未知字段 | `model`, `temperature`, `max_tokens`, `top_p`, `top_k`, `stream` 原样透传 |
| Anthropic `metadata` 字段 | 单向透传 (只在 A 格式中保留，O 格式无对应) |

### 流式响应中 model name

Anthropic `message_start` 事件携带 `message.model`，需缓存到状态机中，后续所有 chunk 的 `model` 字段从缓存读取。OpenAI 方向同理。

## 文件变更

| 文件 | 变更 |
|------|------|
| **创建** `src/main/proxy/converter.ts` | 核心转换模块 |
| **创建** `src/main/proxy/__tests__/converter.test.ts` | 单测 |
| `src/main/proxy/server.ts` | `handleProxyRequest` 加转换判断 |

## 不做的 (YAGNI)

- 不在供应商配置中加开关字段（自动检测已足够）
- 不修改 `forwarder.ts` / `router.ts` / `providers.ts`
- 不修改渲染进程代码
