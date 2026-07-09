# OpenAI Chat Completions API 官方对接文档（完整版）

> 来源：https://developers.openai.ac.cn/api/reference/resources/chat/subresources/completions/methods/create  
> 提取自官方静态 HTML，交叉验证于 2026-06-21

---

## 目录

1. [端点与认证](#1-端点与认证)
2. [请求参数详解](#2-请求参数详解)
3. [messages 消息格式](#3-messages-消息格式)
4. [响应对象结构](#4-响应对象结构)
5. [流式响应（SSE）](#5-流式响应sse)
6. [工具调用（Function Calling）](#6-工具调用function-calling)
7. [推理模式（Reasoning）](#7-推理模式reasoning)
8. [错误处理](#8-错误处理)
9. [调用示例](#9-调用示例)

---

## 1. 端点与认证

### 端点

```
POST https://api.openai.com/v1/chat/completions
```

### 认证

```
Authorization: Bearer OPENAI_API_KEY
```

可选请求头：

| 请求头 | 说明 |
|--------|------|
| `OpenAI-Organization` | 组织 ID，格式 `org-xxx` |
| `OpenAI-Project` | 项目 ID，格式 `proj_xxx` |

---

## 2. 请求参数详解

### `model` ⭐ 必填

**类型**：`string`

模型 ID，如 `gpt-4o`、`o3`、`gpt-5.5`、`gpt-5.5-pro`。

```json
{ "model": "gpt-4o" }
```

**注意事项**：
- `gpt-5.5` 及更新模型推荐使用 `developer` 角色替代 `system` 角色
- 推理模型（`o3`、`o4-mini`）对部分参数不支持，详见各参数说明

---

### `messages` ⭐ 必填

**类型**：`array of ChatCompletionMessageParam`

对话消息列表。根据模型不同，支持不同模态（文本、图片、音频）。

**消息对象类型**：

#### ChatCompletionSystemMessageParam（旧版系统消息）

```json
{
  "role": "system",
  "content": "你是一个有帮助的助手。",
  "name": "optional_name"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | `string` | ✅ | 固定值 `"system"` |
| `content` | `string \| array` | ✅ | 文本内容，或 ContentPart 数组 |
| `name` | `string` | ❌ | 参与者名称，区分同名角色 |

> ⚠️ `gpt-5.5` 及更新模型、**推理模型**推荐使用 `developer` 角色替代 `system`。

#### ChatCompletionDeveloperMessageParam（推荐系统指令）

```json
{
  "role": "developer",
  "content": "你是一个有帮助的助手。",
  "name": "optional_name"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | `string` | ✅ | 固定值 `"developer"` |
| `content` | `string \| array` | ✅ | 指令内容 |
| `name` | `string` | ❌ | 参与者名称 |

#### ChatCompletionUserMessageParam（用户输入）

```json
{
  "role": "user",
  "content": "你好，请介绍一下自己。",
  "name": "user_1"
}
```

**多模态内容格式**（`content` 为数组时）：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "这张图片里是什么？" },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/image.jpg",
        "detail": "auto"
      }
    },
    {
      "type": "input_audio",
      "input_audio": {
        "data": "base64encodedaudiostring",
        "format": "wav"
      }
    }
  ]
}
```

| ContentPart 类型 | 字段 | 说明 |
|-----------------|------|------|
| `text` | `text: string`, `type: "text"` | 文本内容 |
| `image_url` | `image_url.url: string`, `image_url.detail: "auto"\|"low"\|"high"` | 图片 URL 或 base64 |
| `input_audio` | `input_audio.data: string`, `input_audio.format: "wav"\|"mp3"` | 音频输入 |

#### ChatCompletionAssistantMessageParam（助手回复）

```json
{
  "role": "assistant",
  "content": "你好！我是 GPT。",
  "name": "assistant_1",
  "tool_calls": [ ... ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | `string` | ✅ | 固定值 `"assistant"` |
| `content` | `string \| null` | ❌ | 回复内容，`tool_calls` 时可为 `null` |
| `name` | `string` | ❌ | 参与者名称 |
| `tool_calls` | `array` | ❌ | 工具调用列表 |
| `refusal` | `string \| null` | ❌ | 拒绝内容（安全拦截时） |
| `audio` | `object` | ❌ | 音频输出（含 `id`、`data`、`transcript`、`expires_at`） |

#### ChatCompletionToolMessageParam（工具返回）

```json
{
  "role": "tool",
  "content": "62°F",
  "tool_call_id": "call_abc123"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | `string` | ✅ | 固定值 `"tool"` |
| `content` | `string` | ✅ | 工具执行结果 |
| `tool_call_id` | `string` | ✅ | 对应的 `tool_call_id` |

---

### `max_completion_tokens` ⭕ 可选

**类型**：`number`  
**默认值**：`null`（模型默认值）

> ✅ **推荐用于 `o` 系列推理模型**

生成回复的最大 Token 数上限，**包含可见输出 Token 和推理 Token（reasoning tokens）**。

```json
{ "max_completion_tokens": 4096 }
```

| 模型系列 | 推荐参数 | 说明 |
|----------|----------|------|
| `o3`、`o4-mini`、`o1` | `max_completion_tokens` | 必须用此参数 |
| `gpt-4o`、`gpt-4.1`、`gpt-5.5` | `max_tokens` 或 `max_completion_tokens` | 两者均可 |

---

### `max_tokens` ⭕ 可选 ⚠️ 已弃用（部分模型）

**类型**：`number`  
**默认值**：`Infinity`（实际受模型上限限制）

> ⚠️ 已被 `max_completion_tokens` 取代，但仍可用于非推理模型。

聊天完成中可生成的最大 Token 数，可用于控制成本。

---

### `temperature` ⭕ 可选

**类型**：`number`  
**取值范围**：`[0, 2]`  
**默认值**：`1`

采样温度。值越高（如 `0.8`）输出越随机；值越低（如 `0.2`）输出越集中确定。

```json
{ "temperature": 0.7 }
```

> 💡 建议只调节 `temperature` 或 `top_p` 其中之一，不同时调节。

---

### `top_p` ⭕ 可选

**类型**：`number`  
**取值范围**：`(0, 1]`  
**默认值**：`1`

核心采样（nucleus sampling）。模型只考虑累积概率质量达到 `top_p` 的 Token。

```json
{ "top_p": 0.9 }
```

---

### `top_logprobs` ⭕ 可选

**类型**：`integer`  
**取值范围**：`[0, 20]`  
**默认值**：`null`

每个 Token 位置返回的最可能 Token 数量（含 log 概率）。使用时必须设置 `logprobs: true`。

---

### `n` ⭕ 可选

**类型**：`integer`  
**取值范围**：`>= 1`  
**默认值**：`1`

为每个输入消息生成的聊天完成选项数量。**注意**：`n > 1` 时按所有选项的 Token 总数计费。

---

### `stream` ⭕ 可选

**类型**：`boolean`  
**默认值**：`false`

是否使用 SSE（Server-Sent Events）流式返回响应。

```json
{ "stream": true }
```

---

### `stream_options` ⭕ 可选

**类型**：`object`  
**默认值**：`null`

流式响应选项，**仅在 `stream: true` 时设置**。

```json
{
  "stream": true,
  "stream_options": {
    "include_usage": true,
    "include_obfuscation": false
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `include_usage` | `boolean` | 在流的最后一个 chunk 中包含 `usage` 统计 |
| `include_obfuscation` | `boolean` | 在流式 delta 事件中添加混淆字符（防 SSE 解析），默认 `true`；设为 `false` 可简化处理 |

---

### `response_format` ⭕ 可选

**类型**：`object`

强制模型输出指定格式。

#### 类型：`json_object`（JSON 模式）

```json
{
  "response_format": { "type": "json_object" }
}
```

> ⚠️ 使用 `json_object` 时，`messages` 中必须包含指示输出 JSON 的内容，否则模型可能违规输出非 JSON 内容。

#### 类型：`json_schema`（JSON Schema 约束）⭐ 推荐

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "person_info",
      "description": "人物信息",
      "schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "age": { "type": "integer" }
        },
        "required": ["name"]
      },
      "strict": true
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ✅ | 固定值 `"json_schema"` |
| `json_schema.name` | `string` | ✅ | Schema 名称（字母数字下划线，最长 64 字符） |
| `json_schema.description` | `string` | ❌ | Schema 描述 |
| `json_schema.schema` | `object` | ✅ | JSON Schema 定义 |
| `json_schema.strict` | `boolean` | ❌ | 是否严格模式（默认 `false`），严格模式下模型保证输出符合 Schema |

---

### `seed` ⭕ 可选

**类型**：`integer`  
**默认值**：`null`

> 🧪 Beta 功能

确定性采样种子。相同 `seed` 和相同参数下，尽力保证返回相同结果（不保证完全确定）。

```json
{ "seed": 42 }
```

响应中会返回 `system_fingerprint`，当其变化时表示后端有变动。

---

### `service_tier` ⭕ 可选

**类型**：`string`  
**可选值**：`"auto"` \| `"default"` \| `"flex"` \| `"priority"`  
**默认值**：`"auto"`

请求的服务层级：

| 值 | 说明 |
|----|------|
| `auto` | 自动选择 |
| `default` | 标准容量 |
| `flex` | 弹性容量（更便宜，可能更慢） |
| `priority` | 优先容量（更快，更贵） |

---

### `stop` ⭕ 可选

**类型**：`string \| array of string`  
**约束**：最多 4 个序列

生成停止序列。遇到任一序列时停止继续生成。

```json
{ "stop": ["\n", "END"] }
```

> ⚠️ **推理模型 `o3` 和 `o4-mini` 不支持此参数**

---

### `frequency_penalty` ⭕ 可选

**类型**：`number`  
**取值范围**：`[-2.0, 2.0]`  
**默认值**：`0`

频率惩罚。正值根据 Token 在文本中出现的频率惩罚新 Token，降低模型逐字重复的可能性。

---

### `presence_penalty` ⭕ 可选

**类型**：`number`  
**取值范围**：`[-2.0, 2.0]`  
**默认值**：`0`

存在惩罚。正值根据 Token 是否已出现在文本中惩罚新 Token，增加模型谈论新话题的可能性。

---

### `logit_bias` ⭕ 可选

**类型**：`map`  
**取值范围**：key 为 Token ID，value 为 `[-100, 100]`

修改指定 Token 出现的可能性。`-100` 完全禁止，`100` 强制出现。

---

### `logprobs` ⭕ 可选

**类型**：`boolean`  
**默认值**：`false`

是否返回输出 Token 的 log 概率。设为 `true` 时，响应中每个 Token 包含 log 概率信息。

---

### `tool_choice` ⭕ 可选

**类型**：`string \| object`  
**默认值**：`"auto"`

控制模型调用工具的行为。

| 值 | 说明 |
|----|------|
| `"none"` | 不调用任何工具，直接生成消息 |
| `"auto"` | 模型自动选择生成消息或调用工具 |
| `"required"` | 必须调用一个或多个工具 |
| `{"type": "function", "function": {"name": "my_func"}}` | 强制调用指定工具 |

```json
// 自动选择
{ "tool_choice": "auto" }

// 强制调用特定工具
{ "tool_choice": { "type": "function", "function": { "name": "get_weather" } } }

// 禁用并行工具调用
{ "tool_choice": { "type": "function", "function": { "name": "..." }, "disable_parallel_tool_calls": true } }
```

---

### `tools` ⭕ 可选

**类型**：`array of object`

模型可调用的工具列表。支持自定义工具和函数工具。

#### Function Tool 格式

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "获取指定城市的天气",
    "parameters": {
      "type": "object",
      "properties": {
        "city": { "type": "string", "description": "城市名称" },
        "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
      },
      "required": ["city"]
    },
    "strict": true
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ✅ | 固定值 `"function"` |
| `function.name` | `string` | ✅ | 工具名称（正则 `^[a-zA-Z0-9_-]{1,64}$`） |
| `function.description` | `string` | ❌ | 工具描述 |
| `function.parameters` | `object` | ❌ | JSON Schema 定义的参数 |
| `function.strict` | `boolean` | ❌ | 严格模式 |

---

### `parallel_tool_calls` ⭕ 可选

**类型**：`boolean`  
**默认值**：`true`

是否允许模型在单次回复中并行调用多个工具。

---

### `prediction` ⭕ 可选

**类型**：`object`

静态预测输出内容，如正在重新生成的文本文件内容。可加快包含已知前缀的响应速度。

```json
{
  "prediction": {
    "type": "content",
    "content": "def fibonacci(n):\n    if n <= 1:\n        return n\n"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 固定值 `"content"` |
| `content` | `string \| array` | 预测内容 |

---

### `audio` ⭕ 可选

**类型**：`object`

音频输出参数，**当 `modalities` 包含 `"audio"` 时必填**。

```json
{
  "audio": {
    "voice": "alloy",
    "format": "wav"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `voice` | `string` | 音色：`"alloy"`、`"ash"`、`"ballad"`、`"coral"`、`"echo"`、`"fable"`、`"nova"`、`"onyx"`、`"sage"`、`"shimmer"` |
| `format` | `string` | 格式：`"wav"`、`"mp3"`、`"flac"`、`"opus"`、`"pcm16"` |

---

### `modalities` ⭕ 可选

**类型**：`array of string`  
**可选值**：`["text"]` \| `["text", "audio"]`  
**默认值**：`["text"]`

模型生成的输出类型。大多数模型默认生成文本。

```json
{ "modalities": ["text", "audio"] }
```

---

### `user` ⭕ 可选 ⚠️ 已弃用

**类型**：`string`

> ⚠️ 已被 `safety_identifier` 和 `prompt_cache_key` 取代，推荐使用 `prompt_cache_key`。

终端用户的稳定标识符，用于提升缓存命中率、检测滥用。

---

### `metadata` ⭕ 可选

**类型**：`object`  
**约束**：最多 16 个键值对，key 最长 64 字符，value 最长 512 字符

附加到对象的键值对，可用于存储额外信息，或通过 API/控制台查询。

```json
{
  "metadata": {
    "user_id": "user_12345",
    "session_id": "sess_abc"
  }
}
```

---

### `store` ⭕ 可选

**类型**：`boolean`  
**默认值**：`false`

是否存储此次聊天完成请求的输出，用于模型蒸馏或评估产品。

---

### `reasoning_effort` ⭕ 可选 ⭐ 重要

**类型**：`string`  
**可选值**：`"none"` \| `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"`

> ✅ **推理模型专用参数**

控制推理模型（`o3`、`o4-mini`、`o1` 等）的推理强度。降低推理强度可加快响应速度、减少推理 Token 消耗。

```json
{ "reasoning_effort": "high" }
```

| 值 | 说明 |
|----|------|
| `none` | 不进行推理（等同于非推理模型） |
| `minimal` | 最小推理 |
| `low` | 低强度推理 |
| `medium` | 中强度推理（默认） |
| `high` | 高强度推理 |
| `xhigh` | 最高强度推理 |

**配合 `reasoning.max_tokens`**（Beta）：

```json
{
  "reasoning_effort": "high",
  "reasoning": {
    "effort": "high",
    "max_tokens": 2000
  }
}
```

---

### `prompt_cache_key` ⭕ 可选

**类型**：`string`

用于优化 Prompt Caching 命中率的稳定键。**取代 `user` 字段**。

```json
{ "prompt_cache_key": "user_12345_session_abc" }
```

---

### `prompt_cache_retention` ⭕ 可选

**类型**：`string`  
**可选值**：`"24h"` \| `"1h"`（默认）

Prompt Caching 的保留策略。`"24h"` 启用扩展缓存，缓存前缀最长保持 24 小时。

> ⚠️ `gpt-5.5`、`gpt-5.5-pro` 及未来模型仅支持 `"24h"`。

---

### `safety_identifier` ⭕ 可选

**类型**：`string`  
**约束**：最长 64 字符

稳定标识符，用于检测可能违反 OpenAI 使用政策的用户。**建议对用户名或邮箱进行哈希处理后传入**。

---

### `verbosity` ⭕ 可选

**类型**：`string`  
**可选值**：`"low"` \| `"medium"` \| `"high"`

控制模型回复的详细程度。低值更简洁，高值更详细。

---

### `web_search_options` ⭕ 可选

**类型**：`object`

Web 搜索工具配置。

```json
{
  "tools": [{"type": "web_search"}],
  "web_search_options": {
    "search_context_size": "medium",
    "user_location": {
      "type": "approximate",
      "country": "CN",
      "city": "Beijing",
      "region": "Beijing"
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `search_context_size` | `string` | 搜索上下文大小：`"low"`、`"medium"`、`"high"` |
| `user_location` | `object` | 用户位置（影响搜索结果相关性） |
| `user_location.type` | `string` | 固定值 `"approximate"` |
| `user_location.country` | `string` | 国家代码（如 `"CN"`） |
| `user_location.city` | `string` | 城市名 |
| `user_location.region` | `string` | 地区名 |
| `user_location.timezone` | `string` | 时区（如 `"Asia/Shanghai"`） |

---

### `function_call` ⭕ 可选 ⚠️ 已弃用

已被 `tool_choice` 取代。

### `functions` ⭕ 可选 ⚠️ 已弃用

已被 `tools` 取代。

---

## 3. messages 消息格式

### 多轮对话示例

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "developer", "content": "你是一个有帮助的助手，用英文回复。" },
    { "role": "user", "content": "中国的首都是哪里？" },
    { "role": "assistant", "content": "The capital of China is Beijing." },
    { "role": "user", "content": "它有什么著名景点？" }
  ]
}
```

### 图片输入示例

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "描述这张图片" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQ...",
            "detail": "high"
          }
        }
      ]
    }
  ]
}
```

---

## 4. 响应对象结构

### 非流式响应

```json
{
  "id": "chatcmpl-8DpFdHTzCarTHHtr2FfUtjo2vNmm3",
  "object": "chat.completion",
  "created": 1748000000,
  "model": "gpt-4o-2024-08-06",
  "system_fingerprint": "fp_abc123",
  "service_tier": "default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是 GPT-4o。",
        "tool_calls": null
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 20,
    "total_tokens": 35,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0
    }
  }
}
```

### 响应字段详解

#### 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 响应唯一 ID，格式 `chatcmpl-xxx` |
| `object` | `string` | 固定值 `"chat.completion"` |
| `created` | `integer` | Unix 时间戳（秒） |
| `model` | `string` | 实际使用的模型 ID |
| `system_fingerprint` | `string` | 系统指纹，用于检测后端变动 |
| `service_tier` | `string` | 实际使用的服务层级 |
| `choices` | `array` | 生成结果列表 |
| `usage` | `object` | Token 使用统计 |

#### `choices[]` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `index` | `integer` | 选项索引 |
| `message` | `object` | 生成的消息对象 |
| `finish_reason` | `string` | 停止原因（见下表） |
| `logprobs` | `object\|null` | Token log 概率（需设置 `logprobs: true`） |

#### `finish_reason` 取值

| 值 | 说明 |
|----|------|
| `"stop"` | 遇到 `stop` 序列或自然结束 |
| `"length"` | 达到 `max_completion_tokens` 上限 |
| `"tool_calls"` | 模型调用了工具 |
| `"content_filter"` | 被内容过滤器拦截 |
| `"function_call"` | （旧版）调用了函数 |

#### `usage` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt_tokens` | `integer` | 输入 Token 数 |
| `completion_tokens` | `integer` | 输出 Token 数 |
| `total_tokens` | `integer` | 总 Token 数 |
| `prompt_tokens_details.cached_tokens` | `integer` | Prompt Caching 命中 Token 数 |
| `prompt_tokens_details.audio_tokens` | `integer` | 输入音频 Token 数 |
| `completion_tokens_details.reasoning_tokens` | `integer` | 推理 Token 数 |
| `completion_tokens_details.audio_tokens` | `integer` | 输出音频 Token 数 |

---

## 5. 流式响应（SSE）

### 请求

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-...

{
  "model": "gpt-4o",
  "messages": [...],
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

### 响应格式

每个 chunk 以 `data: ` 开头，以 `\n\n` 结尾：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"你"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}
...
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

### Chunk 字段详解

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 响应 ID |
| `object` | `string` | 固定值 `"chat.completion.chunk"` |
| `created` | `integer` | Unix 时间戳 |
| `model` | `string` | 模型 ID |
| `choices[].index` | `integer` | 选项索引 |
| `choices[].delta` | `object` | 增量内容 |
| `choices[].delta.role` | `string` | 仅在第一个 chunk 中出现 |
| `choices[].delta.content` | `string\|null` | 增量文本（`null` 表示无内容） |
| `choices[].delta.tool_calls` | `array` | 增量工具调用 |
| `choices[].finish_reason` | `string\|null` | 最后一个 chunk 中非空 |
| `usage` | `object` | 仅当 `include_usage: true` 时在最后 chunk 中出现 |

### 拼接 `tool_calls.arguments`

流式响应中 `tool_calls[].function.arguments` 是增量返回的，需要拼接：

```python
tool_calls = []

for chunk in stream:
    for choice in chunk.choices:
        delta = choice.delta
        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx >= len(tool_calls):
                    tool_calls.append({
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": ""}
                    })
                if tc.function and tc.function.arguments:
                    tool_calls[idx]["function"]["arguments"] += tc.function.arguments

# 最终 tool_calls 完整
import json
for tc in tool_calls:
    args = json.loads(tc["function"]["arguments"])
```

---

## 6. 工具调用（Function Calling）

### 完整流程

**第 1 步**：发送含 `tools` 的请求

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "纽约现在天气怎么样？" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

**第 2 步**：模型返回 `tool_calls`

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"city\": \"New York\"}"
          }
        }
      ]
    },
    "finish_reason": "tool_calls"
  }]
}
```

**第 3 步**：执行工具，将结果返回模型

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "纽约现在天气怎么样？" },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"city\": \"New York\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"city\": \"New York\", \"temperature\": 22, \"unit\": \"celsius\"}"
    }
  ]
}
```

**第 4 步**：模型基于工具结果生成最终回复

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "纽约现在的气温是 22°C，天气晴朗。"
    },
    "finish_reason": "stop"
  }]
}
```

---

## 7. 推理模式（Reasoning）

### 支持的模型

- `o3`、`o4-mini`、`o1`、`o1-mini`、`o1-pro`
- `gpt-5.5`（部分推理能力）

### 参数配置

```json
{
  "model": "o3",
  "messages": [...],
  "reasoning_effort": "high",
  "max_completion_tokens": 10000
}
```

### 注意事项

| 限制 | 说明 |
|------|------|
| `max_completion_tokens` 必填 | 推理模型必须用此参数，不能用 `max_tokens` |
| `temperature`、`top_p` 不支持 | 推理模型不支持温度等采样参数 |
| `stop` 不支持 | `o3`、`o4-mini` 不支持停止序列 |
| 推理 Token 统计 | `usage.completion_tokens_details.reasoning_tokens` 中查看 |

---

## 8. 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败（API Key 无效） |
| 403 | 权限不足 |
| 404 | 资源不存在（模型不存在） |
| 422 | 请求格式错误 |
| 429 | 速率限制或配额用尽 |
| 500 | OpenAI 服务器错误 |
| 502 | 网关错误 |
| 503 | 服务不可用 |

### 错误响应格式

```json
{
  "error": {
    "message": "Invalid value for 'temperature'",
    "type": "invalid_request_error",
    "param": "temperature",
    "code": "invalid_value"
  }
}
```

### 错误类型

| `error.type` | 说明 |
|-------------|------|
| `invalid_request_error` | 请求参数有误 |
| `authentication_error` | 认证失败 |
| `permission_error` | 权限不足 |
| `not_found_error` | 资源不存在 |
| `rate_limit_error` | 速率限制 |
| `insufficient_quota` | 配额用尽 |
| `internal_error` | OpenAI 服务器错误 |

---

## 9. 调用示例

### cURL

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "developer", "content": "你是一个简洁的助手。"},
      {"role": "user", "content": "Introduce yourself in one sentence."}
    ],
    "temperature": 0.7,
    "max_completion_tokens": 100
  }'
```

### Python

```python
from openai import OpenAI

client = OpenAI(api_key="sk-...")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "developer", "content": "你是一个简洁的助手。"},
        {"role": "user", "content": "Introduce yourself in one sentence."}
    ],
    temperature=0.7,
    max_completion_tokens=100
)

print(response.choices[0].message.content)
print(f"Usage: {response.usage}")
```

### Node.js

```javascript
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: 'sk-...' });

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'developer', content: '你是一个简洁的助手。' },
    { role: 'user', content: 'Introduce yourself in one sentence.' }
  ],
  temperature: 0.7,
  max_completion_tokens: 100
});

console.log(response.choices[0].message.content);
```

---

## 附：参数速查表

| 参数 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | ✅ | string | — | 模型 ID |
| `messages` | ✅ | array | — | 对话消息 |
| `max_completion_tokens` | ❌ | number | null | 最大输出 Token（含推理） |
| `max_tokens` | ❌ | number | Infinity | 最大输出 Token（旧） |
| `temperature` | ❌ | number | 1 | 采样温度 [0,2] |
| `top_p` | ❌ | number | 1 | 核心采样 (0,1] |
| `top_logprobs` | ❌ | integer | null | 返回 Top N log 概率 [0,20] |
| `n` | ❌ | integer | 1 | 生成选项数 |
| `stream` | ❌ | boolean | false | 是否流式 |
| `stream_options` | ❌ | object | null | 流式选项 |
| `response_format` | ❌ | object | null | 输出格式约束 |
| `seed` | ❌ | integer | null | 随机种子 |
| `service_tier` | ❌ | string | "auto" | 服务层级 |
| `stop` | ❌ | string/array | null | 停止序列（最多4个） |
| `frequency_penalty` | ❌ | number | 0 | 频率惩罚 [-2,2] |
| `presence_penalty` | ❌ | number | 0 | 存在惩罚 [-2,2] |
| `logit_bias` | ❌ | map | null | Token 概率偏置 |
| `logprobs` | ❌ | boolean | false | 返回 log 概率 |
| `tool_choice` | ❌ | string/object | "auto" | 工具选择策略 |
| `tools` | ❌ | array | null | 工具列表 |
| `parallel_tool_calls` | ❌ | boolean | true | 并行工具调用 |
| `prediction` | ❌ | object | null | 预测输出 |
| `audio` | ❌ | object | null | 音频输出参数 |
| `modalities` | ❌ | array | ["text"] | 输出模态 |
| `user` | ❌ | string | null | 用户 ID（已弃用） |
| `metadata` | ❌ | object | null | 元数据（16 键值对） |
| `store` | ❌ | boolean | false | 是否存储输出 |
| `reasoning_effort` | ❌ | string | null | 推理强度 |
| `prompt_cache_key` | ❌ | string | null | Prompt Cache 键 |
| `prompt_cache_retention` | ❌ | string | "1h" | Prompt Cache 保留策略 |
| `safety_identifier` | ❌ | string | null | 安全标识符 |
| `verbosity` | ❌ | string | null | 回复详细程度 |
| `web_search_options` | ❌ | object | null | Web 搜索选项 |
| `transforms` | ❌ | array | null | 响应变换（Beta） |

---

*文档提取自 OpenAI 官方 API Reference 静态 HTML，最后更新：2026-06-21*
