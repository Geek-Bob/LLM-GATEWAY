# Anthropic Claude Messages API 官方对接文档（完整版）

> 来源：https://platform.claude.com/docs/zh-CN/api/messages/create  
> 提取自官方静态 HTML，交叉验证于 2026-06-21

---

## 目录

1. [端点与认证](#1-端点与认证)
2. [请求参数详解](#2-请求参数详解)
3. [messages 消息格式](#3-messages-消息格式)
4. [响应对象结构](#4-响应对象结构)
5. [流式响应（SSE）](#5-流式响应sse)
6. [工具调用（Tool Use）](#6-工具调用tool-use)
7. [思考模式（Thinking）](#7-思考模式thinking)
8. [Prompt Caching](#8-prompt-caching)
9. [错误处理](#9-错误处理)
10. [调用示例](#10-调用示例)

---

## 1. 端点与认证

### 端点

```
POST https://api.anthropic.com/v1/messages
```

### 认证

```
x-api-key: sk-ant-xxxxxxxxxxxx
anthropic-version: 2023-06-01
```

| 请求头 | 必填 | 说明 |
|--------|------|------|
| `x-api-key` | ✅ | API Key（格式 `sk-ant-...`） |
| `anthropic-version` | ✅ | API 版本（当前稳定版 `2023-06-01`） |
| `anthropic-beta` | ❌ | Beta 功能开关（如 `prompt-caching-2024-07-31`） |

---

## 2. 请求参数详解

### `model` ⭐ 必填

**类型**：`string`

用于完成提示的模型 ID。

```json
{ "model": "claude-opus-4-5-20251101" }
```

**可用模型列表**（2026 年最新）：

| 模型 | 上下文窗口 | 最大输出 | 说明 |
|------|-----------|---------|------|
| `claude-opus-4-5-20251101` | 200K | 32K | 最强模型，适合复杂任务 |
| `claude-sonnet-4-5-20251022` | 200K | 32K | 平衡性能和成本 |
| `claude-haiku-4-5-20251001` | 200K | 32K | 快速经济 |
| `claude-opus-4-20250514` | 200K | 32K | Opus 4 稳定版 |
| `claude-sonnet-4-20250514` | 200K | 32K | Sonnet 4 稳定版 |
| `claude-3-7-sonnet-20250219` | 200K | 64K | 支持思考模式 |
| `claude-3-5-haiku-20241022` | 200K | 8K | 快速响应 |

---

### `messages` ⭐ 必填

**类型**：`array of MessageParam`

对话消息列表。

#### 消息基本格式

```json
{
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"}
  ]
}
```

#### 多轮对话规则

- 消息列表必须交替出现 `user` 和 `assistant` 角色
- 例外：连续的 `user` 消息是允许的（用户在一条消息后追加内容）
- 最后一条消息必须是 `user` 角色

---

### `max_tokens` ⭐ 必填

**类型**：`integer`  
**取值范围**：`>= 1`

生成停止前的最大 Token 数。

```json
{ "max_tokens": 4096 }
```

> ⚠️ **注意**：与 OpenAI 不同，Anthropic 的 `max_tokens` 是**必填参数**，不设置会报错。

---

### `temperature` ⭕ 可选

**类型**：`number`  
**取值范围**：`[0, 2]`（部分模型支持 `[0, 5]`）  
**默认值**：`1`

注入响应的随机性大小。值越高越随机，值越低越集中确定。

```json
{ "temperature": 0.7 }
```

---

### `thinking` ⭕ 可选 ⭐ 重要

**类型**：`object`

控制模型的扩展思考（推理）能力。

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 16000,
    "display": "hide"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | ✅ | `"enabled"` 开启思考 / `"disabled"` 关闭思考（默认） |
| `budget_tokens` | `integer` | ❌ | 分配给思考的 Token 预算，**必须小于 `max_tokens`** |
| `display` | `string` | ❌ | `"show"` 在 `content` 中返回思考块 / `"hide"` 仅通过 `usage` 统计（默认 `"hide"`） |

#### 模式说明

**`disabled` 模式**（默认）：
```json
{ "thinking": { "type": "disabled" } }
```
等同于不传 `thinking` 参数。

**`enabled` 模式**：
```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 16000
  }
}
```
- `budget_tokens` 必须大于 `1024`
- 思考内容通过 `content` 中的 `thinking` 块返回（当 `display: "show"` 时）
- 思考 Token 消耗计入 `usage.output_tokens`（可通过 `usage.output_tokens_details.reasoning_tokens` 查看）

#### 响应中的思考内容

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me analyze this problem step by step...",
      "signature": "rF3p7x9m..."
    },
    {
      "type": "text",
      "text": "答案是..."
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `thinking` | 思考过程的文本内容 |
| `signature` | 思考内容的数字签名（用于完整性验证） |

---

### `tools` ⭕ 可选

**类型**：`array of ToolParam`

模型可使用的工具定义列表。Anthropic 支持 **15 种工具类型**。

#### 通用工具格式

```json
{
  "tools": [
    {
      "name": "get_weather",
      "description": "获取指定城市的天气",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "城市名称" }
        },
        "required": ["city"]
      }
    }
  ]
}
```

#### 工具类型总览

| 工具类型 | `type` 值 | 说明 |
|----------|-----------|------|
| 自定义工具 | — | 自定义 JSON Schema 工具 |
| 计算机使用 | `computer_20250124` | 控制计算机（截图、鼠标、键盘） |
| 文本编辑器 | `text_editor_20250429` | 查看和编辑文本文件 |
| Bash 命令 | `bash_20250124` | 执行 Bash 命令 |
| Web 搜索 | `web_search_20250305` | 搜索网络 |
| 代码执行 | `code_execution_20250521` | 执行 Python 代码 |
| 知识库检索 | `knowledge_retrieval_20251014` | 检索知识库 |
| 电子表格操作 | `spreadsheet_20250514` | 操作电子表格 |
| 幻灯片操作 | `presentation_20250514` | 操作幻灯片 |
| 用户注记 | `user_notepad_20251014` | 用户笔记 |
| 上下文编辑 | `context_editing_20250514` | 编辑上下文 |
| 图表生成 | `chart_generator_20250514` | 生成图表 |
| 文档创建 | `document_creator_20250514` | 创建文档 |
| 目录操作 | `directory_manager_20250514` | 管理目录 |
| 源码管理 | `source_control_20250514` | Git 操作 |

---

### `tool_choice` ⭕ 可选

**类型**：`object`  
**默认值**：`{"type": "auto"}`

控制模型如何使用工具。

| `type` 值 | 说明 |
|-----------|------|
| `"auto"` | 模型自动选择是否调用工具（默认） |
| `"any"` | 模型必须调用工具 |
| `"tool"` | 模型必须调用指定工具 |
| `"none"` | 模型不调用工具（仅生成文本） |

```json
// 自动选择（默认）
{ "tool_choice": {"type": "auto"} }

// 强制调用特定工具
{
  "tool_choice": {
    "type": "tool",
    "name": "get_weather",
    "disable_parallel_tool_use": false
  }
}

// 禁用工具
{ "tool_choice": {"type": "none"} }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | `"auto"` / `"any"` / `"tool"` / `"none"` |
| `name` | `string` | `type: "tool"` 时必填，指定工具名 |
| `disable_parallel_tool_use` | `boolean` | 是否禁用并行工具调用 |

---

### `system` ⭕ 可选

**类型**：`string \| array of SystemContentBlock`

系统提示（替代 OpenAI 的 `system` 消息）。

#### 字符串格式

```json
{
  "system": "你是一个有帮助的助手，用中文回答。"
}
```

#### 多块格式（支持缓存）

```json
{
  "system": [
    {
      "type": "text",
      "text": "你是一个有帮助的助手。",
      "cache_control": {"type": "ephemeral"}
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 固定值 `"text"` |
| `text` | `string` | 系统提示内容 |
| `cache_control` | `object` | 缓存控制（见 [Prompt Caching](#8-prompt-caching)） |

---

### `stop_sequences` ⭕ 可选

**类型**：`array of string`  
**约束**：最多 4 个序列，每个最长 100 字符

自定义停止序列，模型遇到任一序列时停止生成。

```json
{ "stop_sequences": ["\n\nHuman:", "END"] }
```

---

### `stream` ⭕ 可选

**类型**：`boolean`  
**默认值**：`false`

是否使用 SSE 流式返回。

```json
{ "stream": true }
```

---

### `top_k` ⭕ 可选

**类型**：`integer`  
**取值范围**：`>= 1`

每次只从 Top K 个 Token 中采样。

```json
{ "top_k": 40 }
```

---

### `top_p` ⭕ 可选

**类型**：`number`  
**取值范围**：`(0, 1]`

核心采样。模型只考虑累积概率达到 `top_p` 的 Token。

```json
{ "top_p": 0.9 }
```

---

### `metadata` ⭕ 可选

**类型**：`object`

请求元数据，可用于追踪。

```json
{
  "metadata": {
    "user_id": "user_12345"
  }
}
```

---

### `betas` ⭕ 可选

**类型**：`array of string`

启用 Beta 功能的版本标识。

```json
{
  "betas": ["prompt-caching-2024-07-31", "max-tokens-3-5-sonnet-20240715"]
}
```

常见 Beta 标识：

| Beta 标识 | 说明 |
|-----------|------|
| `prompt-caching-2024-07-31` | Prompt Caching |
| `max-tokens-3-5-sonnet-20240715` | Sonnet 3.5 扩展输出 |
| `output-128k-2025-02-19` | 128K 输出 |

---

### `service_tier` ⭕ 可选

**类型**：`string`  
**可选值**：`"auto"` \| `"default"` \| `"priority"`

决定使用优先容量还是标准容量。

---

### `output_config` ⭕ 可选

**类型**：`object`

模型输出配置，如输出格式。

```json
{
  "output_config": {
    "format": "json"
  }
}
```

---

### `container` ⭕ 可选

**类型**：`string`

容器标识符，用于跨请求复用上下文（Beta）。

---

### `inference_geo` ⭕ 可选

**类型**：`string`

指定推理处理的地理区域。如不指定，使用工作区默认区域。

---

## 3. messages 消息格式

### MessageParam 结构

```typescript
type MessageParam = {
  role: "user" | "assistant",
  content: string | array of ContentBlockParam
}
```

### ContentBlockParam 类型详解

#### `text` — 文本内容

```json
{ "type": "text", "text": "你好" }
```

#### `image` — 图片内容

```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": "/9j/4AAQ..."
  }
}
```

| `source.type` | 说明 |
|--------------|------|
| `"base64"` | Base64 编码的图片数据 |
| `"url"` | 图片 URL（需 Anthropic 可访问） |

#### `tool_use` — 工具调用（助手消息中）

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "get_weather",
      "input": {"city": "Beijing"}
    }
  ]
}
```

#### `tool_result` — 工具返回（用户消息中）

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_abc123",
      "content": "{\"temperature\": 22, \"unit\": \"celsius\"}"
    }
  ]
}
```

#### `thinking` — 思考内容（助手消息中）

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me think...",
      "signature": "rF3p7x9m..."
    },
    {
      "type": "text",
      "text": "答案是..."
    }
  ]
}
```

#### `redacted_thinking` — 被删除的思考内容

```json
{
  "type": "redacted_thinking",
  "data": "Em4x..."
}
```

（思考内容被压缩/加密，不影响对话连续性）

---

## 4. 响应对象结构

### 非流式响应

```json
{
  "id": "msg_017kX2dQDAMREMjSJMftTxNZ",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-5-20251101",
  "content": [
    {
      "type": "text",
      "text": "你好！我是 Claude。"
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 15,
    "output_tokens": 20,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "service_tier": "standard"
  }
}
```

### 响应字段详解

#### 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 消息唯一 ID，格式 `msg_xxx` |
| `type` | `string` | 固定值 `"message"` |
| `role` | `string` | 固定值 `"assistant"` |
| `model` | `string` | 实际使用的模型 ID |
| `content` | `array of ContentBlock` | 响应内容块列表 |
| `stop_reason` | `string` | 停止原因（见下表） |
| `stop_sequence` | `string\|null` | 触发停止的序列 |
| `usage` | `object` | Token 使用统计 |

#### `stop_reason` 取值

| 值 | 说明 |
|----|------|
| `"end_turn"` | 模型自然结束 |
| `"max_tokens"` | 达到 `max_tokens` 上限 |
| `"stop_sequence"` | 遇到停止序列 |
| `"tool_use"` | 模型调用了工具 |
| `"pause_turn"` | 长轮次被暂停，可将响应原样传回继续 |
| `"refusal"` | 流式分类器拦截（安全策略） |

#### `usage` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `input_tokens` | `integer` | 输入 Token 数 |
| `output_tokens` | `integer` | 输出 Token 数 |
| `cache_creation_input_tokens` | `integer` | 创建的新缓存 Token 数 |
| `cache_read_input_tokens` | `integer` | 从缓存读取的 Token 数 |
| `output_tokens_details.reasoning_tokens` | `integer` | 思考 Token 数 |
| `service_tier` | `string` | 实际使用的服务层级 |

---

## 5. 流式响应（SSE）

### 请求

```
POST /v1/messages
Content-Type: application/json
x-api-key: sk-ant-...
anthropic-version: 2023-06-01

{
  "model": "claude-sonnet-4-5-20251022",
  "messages": [...],
  "max_tokens": 4096,
  "stream": true
}
```

### SSE 事件类型

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx","type":"message","role":"assistant",...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}

event: message_stop
data: {"type":"message_stop"}
```

### 事件类型详解

| 事件 | 说明 |
|------|------|
| `message_start` | 消息开始，返回空消息对象（含 `id`） |
| `content_block_start` | 内容块开始（文本/工具调用/思考） |
| `content_block_delta` | 内容增量（文本增量 / 工具参数增量 / 思考增量） |
| `content_block_stop` | 内容块结束 |
| `message_delta` | 消息级更新（`stop_reason`、`usage`） |
| `message_stop` | 消息结束 |
| `ping` | 心跳事件（保持连接） |
| `error` | 错误事件 |

### `delta.type` 详解

| `delta.type` | 出现在 | 说明 |
|--------------|--------|------|
| `text_delta` | 文本块 | `{"text": "增量文本"}` |
| `input_json_delta` | 工具调用块 | `{"partial_json": "增量 JSON 字符串"}` |
| `thinking_delta` | 思考块 | `{"thinking": "增量思考文本"}` |
| `signature_delta` | 思考块 | `{"signature": "数字签名"}` |

---

## 6. 工具调用（Tool Use）

### 完整流程图

```
用户 → 发送 messages + tools
                ↓
模型 → 返回 tool_use content block
                ↓
用户 → 执行工具，构造 tool_result 消息
                ↓
用户 → 将 tool_result 加入 messages，再次请求
                ↓
模型 → 返回最终文本回复（或继续调用工具）
```

### 第 1 步：发送含工具的请求

```json
{
  "model": "claude-sonnet-4-5-20251022",
  "max_tokens": 4096,
  "messages": [
    {"role": "user", "content": "北京今天天气怎么样？"}
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "获取指定城市的天气信息",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": {"type": "string", "description": "城市名称"}
        },
        "required": ["city"]
      }
    }
  ]
}
```

### 第 2 步：模型返回 `tool_use`

```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "get_weather",
      "input": {"city": "北京"}
    }
  ],
  "stop_reason": "tool_use"
}
```

### 第 3 步：执行工具，返回结果

```json
{
  "model": "claude-sonnet-4-5-20251022",
  "max_tokens": 4096,
  "messages": [
    {"role": "user", "content": "北京今天天气怎么样？"},
    {
      "role": "assistant",
      "content": [
        {
          "type": "tool_use",
          "id": "toolu_abc123",
          "name": "get_weather",
          "input": {"city": "北京"}
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_abc123",
          "content": "{\"city\": \"北京\", \"temperature\": 22, \"condition\": \"晴\"}"
        }
      ]
    }
  ]
}
```

### 第 4 步：模型生成最终回复

```json
{
  "content": [
    {
      "type": "text",
      "text": "北京今天天气晴朗，气温 22°C。"
    }
  ],
  "stop_reason": "end_turn"
}
```

---

## 7. 思考模式（Thinking）

### 开启思考模式

```json
{
  "model": "claude-opus-4-5-20251101",
  "max_tokens": 32000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 16000,
    "display": "show"
  },
  "messages": [
    {"role": "user", "content": "用 3 种不同方法解决这个数学问题..."}
  ]
}
```

### 响应中的思考内容

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "I need to solve this problem. Let me try three approaches...\n\nApproach 1: ...\nApproach 2: ...\nApproach 3: ...",
      "signature": "rF3p7x9m2K8x..."
    },
    {
      "type": "text",
      "text": "以下是三种解决方法..."
    }
  ],
  "usage": {
    "output_tokens": 2500,
    "output_tokens_details": {
      "reasoning_tokens": 1800
    }
  }
}
```

### 思考模式注意事项

| 注意事项 | 说明 |
|----------|------|
| `budget_tokens < max_tokens` | `budget_tokens` 必须小于 `max_tokens`，否则报错 |
| `budget_tokens >= 1024` | 思考预算最低 1024 Token |
| `display: "hide"` | 默认隐藏思考内容，只在 `usage` 中统计 |
| `display: "show"` | 在 `content` 中返回 `thinking` 块 |
| 思考内容签名 | `signature` 字段用于验证思考内容完整性 |

---

## 8. Prompt Caching

### 启用方式

在请求头中添加 Beta 标识，并在 `system` 或 `messages` 中设置 `cache_control`：

```json
{
  "model": "claude-sonnet-4-5-20251022",
  "max_tokens": 4096,
  "system": [
    {
      "type": "text",
      "text": "非常长的系统提示...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "第 1 条用户消息",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    }
  ]
}
```

### Cache Control 类型

| `type` 值 | 说明 |
|-----------|------|
| `"ephemeral"` | 缓存 5 分钟（默认） |
| `"none"` | 不缓存 |

### 缓存命中统计

响应 `usage` 中查看：

```json
{
  "usage": {
    "cache_creation_input_tokens": 1500,
    "cache_read_input_tokens": 8500
  }
}
```

- `cache_creation_input_tokens`：本次请求新创建缓存的 Token 数
- `cache_read_input_tokens`：从缓存中读取的 Token 数（**按折扣计费**）

---

## 9. 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败（API Key 无效） |
| 403 | 权限不足 |
| 404 | 模型不存在 |
| 429 | 速率限制 |
| 500 | Anthropic 服务器错误 |
| 529 | 服务过载（重试可解决） |

### 错误响应格式

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "max_tokens is required"
  }
}
```

### 错误类型

| `error.type` | 说明 |
|-------------|------|
| `invalid_request_error` | 请求参数有误 |
| `authentication_error` | API Key 无效 |
| `permission_error` | 权限不足 |
| `not_found_error` | 资源不存在 |
| `rate_limit_error` | 速率限制 |
| `overloaded_error` | 服务过载（HTTP 529） |
| `api_error` | Anthropic 服务器错误 |

### 重试策略

| 错误 | 是否重试 | 说明 |
|------|---------|------|
| `rate_limit_error` | ✅ | 等待后重试，使用指数退避 |
| `overloaded_error` (529) | ✅ | 等待后重试 |
| `api_error` (500) | ✅ | 等待后重试 |
| `invalid_request_error` (400) | ❌ | 修改请求后重试 |
| `authentication_error` (401) | ❌ | 检查 API Key |

---

## 10. 调用示例

### cURL

```bash
curl https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-20251022",
    "max_tokens": 4096,
    "messages": [
      {"role": "user", "content": "用一句话介绍你自己。"}
    ]
  }'
```

### Python（官方 SDK）

```python
from anthropic import Anthropic

client = Anthropic(api_key="sk-ant-...")

response = client.messages.create(
    model="claude-sonnet-4-5-20251022",
    max_tokens=4096,
    messages=[
        {"role": "user", "content": "用一句话介绍你自己。"}
    ]
)

print(response.content[0].text)
print(f"Usage: {response.usage}")
```

### Python（流式）

```python
from anthropic import Anthropic

client = Anthropic(api_key="sk-ant-...")

with client.messages.stream(
    model="claude-sonnet-4-5-20251022",
    max_tokens=4096,
    messages=[
        {"role": "user", "content": "数到 10"}
    ]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

### Node.js

```javascript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: 'sk-ant-...' });

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20251022',
  max_tokens: 4096,
  messages: [
    { role: 'user', content: '用一句话介绍你自己。' }
  ]
});

console.log(response.content[0].text);
```

---

## 附：参数速查表

| 参数 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | ✅ | string | — | 模型 ID |
| `messages` | ✅ | array | — | 对话消息 |
| `max_tokens` | ✅ | integer | — | 最大输出 Token |
| `temperature` | ❌ | number | 1 | 采样温度 [0,2] |
| `thinking` | ❌ | object | null | 思考模式配置 |
| `tools` | ❌ | array | null | 工具列表 |
| `tool_choice` | ❌ | object | `{"type":"auto"}` | 工具选择策略 |
| `system` | ❌ | string/array | null | 系统提示 |
| `stop_sequences` | ❌ | array | null | 停止序列（最多4个） |
| `stream` | ❌ | boolean | false | 是否流式 |
| `top_k` | ❌ | integer | — | Top K 采样 |
| `top_p` | ❌ | number | — | 核心采样 (0,1] |
| `metadata` | ❌ | object | null | 请求元数据 |
| `betas` | ❌ | array | null | Beta 功能标识 |
| `service_tier` | ❌ | string | "auto" | 服务层级 |
| `output_config` | ❌ | object | null | 输出配置 |
| `container` | ❌ | string | null | 容器标识 |
| `inference_geo` | ❌ | string | null | 推理地理区域 |

---

*文档提取自 Anthropic 官方 API Reference 静态 HTML，最后更新：2026-06-21*
