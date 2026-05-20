# 协议自动转换 实施计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付

**目标：** 实现 OpenAI ⇄ Anthropic 协议自动转换，代理服务器自动检测请求格式与供应商类型不匹配时进行全字段双向转换

**架构：** 新建 `src/main/proxy/converter.ts` 纯函数模块（~500 行），导出 `convertRequest` / `convertResponse` / `convertSSEEvent` / `mapFinishReason` 四个顶层函数。`server.ts` 的 `handleProxyRequest` 中插入 ~30 行转换判断逻辑。参照 new-api 的 Go 实现，适配为 TypeScript 迭代器/纯函数模式

**技术栈：** TypeScript, vitest, Node.js streams, SSE 协议

**追踪：** `[ ] 0/7 任务` — 计划阶段

---

### Task 1: Stop/Finish Reason 映射表 + mapFinishReason

**文件：**
- 创建：`src/main/proxy/converter.ts`（仅 mapFinishReason 部分）
- 创建：`src/main/proxy/__tests__/converter.test.ts`（仅 reason 测试）

**步骤：**
- [ ] **步骤 1：编写会失败的测试**

```typescript
// src/main/proxy/__tests__/converter.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mapFinishReason } from '../converter'

describe('mapFinishReason', () => {
  describe('toOpenAI direction', () => {
    it('should map end_turn to stop', () => {
      expect(mapFinishReason('end_turn', 'toOpenAI')).toBe('stop')
    })
    it('should map stop_sequence to stop', () => {
      expect(mapFinishReason('stop_sequence', 'toOpenAI')).toBe('stop')
    })
    it('should map max_tokens to length', () => {
      expect(mapFinishReason('max_tokens', 'toOpenAI')).toBe('length')
    })
    it('should map tool_use to tool_calls', () => {
      expect(mapFinishReason('tool_use', 'toOpenAI')).toBe('tool_calls')
    })
    it('should map refusal to content_filter', () => {
      expect(mapFinishReason('refusal', 'toOpenAI')).toBe('content_filter')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toOpenAI')).toBe('unknown_reason')
    })
    it('should handle empty string', () => {
      expect(mapFinishReason('', 'toOpenAI')).toBe('')
    })
  })

  describe('toAnthropic direction', () => {
    it('should map stop to end_turn', () => {
      expect(mapFinishReason('stop', 'toAnthropic')).toBe('end_turn')
    })
    it('should map stop_sequence to stop_sequence', () => {
      expect(mapFinishReason('stop_sequence', 'toAnthropic')).toBe('stop_sequence')
    })
    it('should map length to max_tokens', () => {
      expect(mapFinishReason('length', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map max_tokens to max_tokens', () => {
      expect(mapFinishReason('max_tokens', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map content_filter to refusal', () => {
      expect(mapFinishReason('content_filter', 'toAnthropic')).toBe('refusal')
    })
    it('should map tool_calls to tool_use', () => {
      expect(mapFinishReason('tool_calls', 'toAnthropic')).toBe('tool_use')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toAnthropic')).toBe('unknown_reason')
    })
  })
})
```

- [ ] **步骤 2：运行测试确认它失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：全部 FAIL — `mapFinishReason is not a function`

- [ ] **步骤 3：编写最简实现**

```typescript
// src/main/proxy/converter.ts
const CLAUDE_TO_OPENAI: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
}

const OPENAI_TO_CLAUDE: Record<string, string> = {
  stop: 'end_turn',
  stop_sequence: 'stop_sequence',
  length: 'max_tokens',
  max_tokens: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
}

export function mapFinishReason(
  reason: string,
  direction: 'toOpenAI' | 'toAnthropic'
): string {
  if (!reason) return ''
  const map = direction === 'toOpenAI' ? CLAUDE_TO_OPENAI : OPENAI_TO_CLAUDE
  return map[reason.toLowerCase()] ?? reason
}
```

- [ ] **步骤 4：运行测试确认它通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：14 个测试全部 PASS

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add stop/finish reason mapping for protocol conversion"
```

---
### Task 2: openaiToAnthropicRequest — 请求体 O→A 转换

这是最核心的函数。处理：基础字段、system prompt 抽取、消息重排、tools、tool_choice、web search、thinking、response_format、stop、cache_control 透传、不兼容字段移除。

**文件：**
- 修改：`src/main/proxy/converter.ts`（追加 ~180 行）
- 修改：`src/main/proxy/__tests__/converter.test.ts`（追加测试）

**步骤：**

- [ ] **步骤 1：编写会失败的测试**

```typescript
// 追加到 converter.test.ts 的 import 行后面
import { convertRequest } from '../converter'

// 追加到文件末尾
describe('convertRequest O→A', () => {
  const minimalOpenaiBody = {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ],
  }

  it('should convert path from /v1/chat/completions to /v1/messages', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.path).toBe('/v1/messages')
  })

  it('should extract system message to top-level system field', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.system).toEqual([
      { type: 'text', text: 'You are helpful.' },
    ])
  })

  it('should NOT include system role in messages array', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    const hasSystem = result.body.messages.some(
      (m: any) => m.role === 'system'
    )
    expect(hasSystem).toBe(false)
  })

  it('should preserve user messages', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.messages).toHaveLength(1)
    expect(result.body.messages[0]).toEqual({
      role: 'user',
      content: 'Hello',
    })
  })

  it('should passthrough basic fields', () => {
    const body = {
      ...minimalOpenaiBody,
      model: 'gpt-4-turbo',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 0.9,
      stream: true,
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.model).toBe('gpt-4-turbo')
    expect(result.body.temperature).toBe(0.7)
    expect(result.body.max_tokens).toBe(1000)
    expect(result.body.top_p).toBe(0.9)
    expect(result.body.stream).toBe(true)
  })

  it('should passthrough top_k if present', () => {
    const body = { ...minimalOpenaiBody, top_k: 50 }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.top_k).toBe(50)
  })

  it('should convert stop string to stop_sequences array', () => {
    const body = { ...minimalOpenaiBody, stop: '\n\n' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.stop_sequences).toEqual(['\n\n'])
  })

  it('should convert stop array to stop_sequences array', () => {
    const body = { ...minimalOpenaiBody, stop: ['\n', 'END'] }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.stop_sequences).toEqual(['\n', 'END'])
  })

  it('should merge consecutive same-role messages', () => {
    const body = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Part 1' },
        { role: 'user', content: 'Part 2' },
      ],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages).toHaveLength(1)
    expect(result.body.messages[0].content).toBe('Part 1 Part 2')
  })

  it('should replace empty content with "..."', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: '' }],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages[0].content).toBe('...')
  })

  it('should insert user placeholder if first message is assistant', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'assistant', content: 'I already started.' }],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages[0]).toEqual({
      role: 'user',
      content: '...',
    })
    expect(result.body.messages[1].role).toBe('assistant')
  })

  it('should convert OpenAI tools to Claude Tool format', () => {
    const body = {
      ...minimalOpenaiBody,
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tools).toHaveLength(1)
    expect(result.body.tools[0]).toEqual({
      name: 'get_weather',
      description: 'Get current weather',
      input_schema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    })
  })

  it('should map tool_choice auto', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'auto' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'auto' })
  })

  it('should map tool_choice required to any', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'required' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'any' })
  })

  it('should map tool_choice none', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'none' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'none' })
  })

  it('should map reasoning_effort to thinking budget_tokens', () => {
    const body = { ...minimalOpenaiBody, reasoning_effort: 'medium' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 2048,
    })
  })

  it('should map response_format json_object to system prompt', () => {
    const body = {
      ...minimalOpenaiBody,
      response_format: { type: 'json_object' },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.system).toBeDefined()
    const lastSystem = result.body.system[result.body.system.length - 1]
    expect(lastSystem.text).toContain('valid JSON')
  })

  it('should convert response_format json_schema to tool + tool_choice', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    }
    const body = {
      ...minimalOpenaiBody,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'MySchema', strict: true, schema },
      },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tools).toBeDefined()
    expect(result.body.tools[0].name).toBe('MySchema')
    expect(result.body.tools[0].input_schema).toEqual(schema)
    expect(result.body.tool_choice).toEqual({
      type: 'tool',
      name: 'MySchema',
    })
  })

  it('should remove incompatible OpenAI fields', () => {
    const body = {
      ...minimalOpenaiBody,
      n: 3,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      seed: 42,
      logprobs: true,
      top_logprobs: 3,
      logit_bias: { '1234': 5 },
      stream_options: { include_usage: true },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.n).toBeUndefined()
    expect(result.body.frequency_penalty).toBeUndefined()
    expect(result.body.presence_penalty).toBeUndefined()
    expect(result.body.seed).toBeUndefined()
    expect(result.body.logprobs).toBeUndefined()
    expect(result.body.top_logprobs).toBeUndefined()
    expect(result.body.logit_bias).toBeUndefined()
    expect(result.body.stream_options).toBeUndefined()
  })

  it('should add default max_tokens if missing', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.max_tokens).toBeDefined()
    expect(result.body.max_tokens).toBeGreaterThan(0)
  })
})
```

- [ ] **步骤 2：运行测试确认它们失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：18 个新测试 FAIL — `convertRequest is not a function`

- [ ] **步骤 3：编写 openaiToAnthropicRequest 实现**

在 `converter.ts` 中 `mapFinishReason` 之后追加：

```typescript
type ProtocolFormat = 'openai' | 'anthropic'

// OpenAI 不兼容字段列表
const OPENAI_INCOMPATIBLE_FIELDS = [
  'n', 'frequency_penalty', 'presence_penalty', 'seed',
  'logprobs', 'top_logprobs', 'logit_bias', 'stream_options',
]

function openaiToAnthropicRequest(
  openaiBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic field passthrough
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (openaiBody[key] !== undefined) {
      result[key] = openaiBody[key]
    }
  }

  // max_tokens with default
  result.max_tokens = openaiBody.max_tokens ?? openaiBody.max_completion_tokens ?? 4096

  // Stop sequences
  if (openaiBody.stop) {
    result.stop_sequences = Array.isArray(openaiBody.stop)
      ? openaiBody.stop
      : [openaiBody.stop]
  }

  // Messages — extract system, merge consecutive, enforce first=user
  const rawMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string; name?: string; cache_control?: any }> =
    openaiBody.messages ?? []

  // Extract system messages
  const systemBlocks: Array<{ type: string; text?: string; cache_control?: any }> = []
  const nonSystemMessages: typeof rawMessages = []

  for (const msg of rawMessages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content) {
        systemBlocks.push({ type: 'text', text: content })
      }
    } else {
      nonSystemMessages.push(msg)
    }
  }

  // Merge consecutive same-role messages (Claude requires alternating roles)
  const mergedMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }> = []
  for (const msg of nonSystemMessages) {
    const prev = mergedMessages[mergedMessages.length - 1]
    if (
      prev &&
      prev.role === msg.role &&
      prev.role !== 'tool' &&
      typeof prev.content === 'string' &&
      typeof msg.content === 'string' &&
      !msg.tool_calls
    ) {
      prev.content = `${prev.content} ${msg.content}`
    } else {
      mergedMessages.push({ ...msg })
    }
  }

  // Convert to Claude message format
  const claudeMessages: Array<Record<string, any>> = []
  let isFirst = true

  for (const msg of mergedMessages) {
    // Ensure first message is user
    if (isFirst && msg.role !== 'user') {
      claudeMessages.push({ role: 'user', content: '...' })
    }
    isFirst = false

    if (msg.role === 'tool') {
      // tool_result → append to previous user message or create new user
      const prev = claudeMessages[claudeMessages.length - 1]
      const toolResultBlock: Record<string, any> = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id ?? '',
        content: msg.content,
      }
      // Preserve cache_control on tool_result
      if ((msg as any).cache_control) {
        toolResultBlock.cache_control = (msg as any).cache_control
      }
      if (prev && prev.role === 'user') {
        if (typeof prev.content === 'string') {
          prev.content = [
            { type: 'text', text: prev.content },
            toolResultBlock,
          ]
        } else if (Array.isArray(prev.content)) {
          prev.content.push(toolResultBlock)
        }
      } else {
        claudeMessages.push({
          role: 'user',
          content: [toolResultBlock],
        })
      }
    } else if (typeof msg.content === 'string' && !msg.tool_calls) {
      const text = msg.content || '...'
      claudeMessages.push({
        role: msg.role,
        content: text,
      })
    } else {
      // Complex content (arrays, images) or tool_calls
      const blocks: Array<Record<string, any>> = []
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            blocks.push({ type: 'text', text: part.text || '...' })
          } else if (part.type === 'image_url') {
            // Extract base64 from data URL or pass through
            let source = part.image_url?.url ?? ''
            let mediaType = 'image/jpeg'
            if (source.startsWith('data:')) {
              const match = source.match(/^data:([^;]+);base64,(.+)$/)
              if (match) {
                mediaType = match[1]
                source = match[2]
              }
            }
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: source },
            })
          }
        }
      } else if (typeof msg.content === 'string') {
        blocks.push({ type: 'text', text: msg.content || '...' })
      }
      // tool_calls → tool_use blocks
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let inputObj: any = {}
          try { inputObj = JSON.parse(tc.function?.arguments || '{}') } catch {}
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name ?? '',
            input: inputObj,
          })
        }
      }
      claudeMessages.push({ role: msg.role, content: blocks })
    }
  }

  result.messages = claudeMessages

  // System field
  if (systemBlocks.length > 0) {
    result.system = systemBlocks
  }

  // Tools
  if (openaiBody.tools) {
    result.tools = openaiBody.tools
      .filter((t: any) => t.type === 'function')
      .map((t: any) => {
        const params = t.function?.parameters ?? {}
        return {
          name: t.function?.name ?? '',
          description: t.function?.description ?? '',
          input_schema: {
            type: params.type ?? 'object',
            ...Object.fromEntries(
              Object.entries(params).filter(([k]) => k !== 'type')
            ),
          },
        }
      })
  }

  // Tool choice
  if (openaiBody.tool_choice !== undefined) {
    result.tool_choice = mapToolChoice(openaiBody.tool_choice, openaiBody.parallel_tool_calls)
  } else if (openaiBody.parallel_tool_calls !== undefined) {
    result.tool_choice = mapToolChoice('auto', openaiBody.parallel_tool_calls)
  }

  // Web search
  if (openaiBody.web_search_options) {
    const wso = openaiBody.web_search_options
    const maxUsesMap: Record<string, number> = { low: 1, medium: 5, high: 10 }
    const webSearchTool: Record<string, any> = {
      type: 'web_search_20250305',
      name: 'web_search',
    }
    if (wso.search_context_size) {
      webSearchTool.max_uses = maxUsesMap[wso.search_context_size] ?? 5
    }
    if (wso.user_location) {
      webSearchTool.user_location = { type: 'approximate', ...wso.user_location.approximate }
    }
    if (!result.tools) result.tools = []
    result.tools.push(webSearchTool)
  }

  // Reasoning effort → thinking
  if (openaiBody.reasoning_effort) {
    const budgetMap: Record<string, number> = { low: 1280, medium: 2048, high: 4096 }
    result.thinking = {
      type: 'enabled',
      budget_tokens: budgetMap[openaiBody.reasoning_effort] ?? 2048,
    }
  }

  // Response format
  if (openaiBody.response_format) {
    const rf = openaiBody.response_format
    if (rf.type === 'json_object') {
      const jsonHint = '\nYou must respond with valid JSON only. Do not wrap in markdown.'
      if (result.system) {
        const lastSys = result.system[result.system.length - 1]
        lastSys.text = (lastSys.text ?? '') + jsonHint
      } else {
        result.system = [{ type: 'text', text: jsonHint.trim() }]
      }
    } else if (rf.type === 'json_schema' && rf.json_schema) {
      const schema = rf.json_schema
      const jsonSchemaTool = {
        name: schema.name ?? 'json_output',
        description: schema.description ?? '',
        input_schema: schema.schema ?? {},
      }
      if (!result.tools) result.tools = []
      result.tools.push(jsonSchemaTool)
      result.tool_choice = { type: 'tool', name: schema.name }
    }
  }

  // Remove incompatible fields
  for (const field of OPENAI_INCOMPATIBLE_FIELDS) {
    delete result[field]
  }

  return { body: result, path: '/v1/messages' }
}

function mapToolChoice(
  toolChoice: any,
  parallelToolCalls?: boolean
): Record<string, any> | undefined {
  let result: Record<string, any> | undefined

  if (typeof toolChoice === 'string') {
    const map: Record<string, string> = { auto: 'auto', required: 'any', none: 'none' }
    const type = map[toolChoice]
    if (type) result = { type }
  } else if (typeof toolChoice === 'object' && toolChoice?.function?.name) {
    result = { type: 'tool', name: toolChoice.function.name }
  }

  if (result && result.type !== 'none' && parallelToolCalls !== undefined) {
    result.disable_parallel_tool_use = !parallelToolCalls
  }

  return result
}
```

- [ ] **步骤 4：运行测试确认它们通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：32 个测试全部 PASS（14 reason + 18 request O→A）

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add openaiToAnthropicRequest body conversion"
```

---
### Task 3: anthropicToOpenAIRequest — 请求体 A→O 转换

**文件：**
- 修改：`src/main/proxy/converter.ts`（追加 ~100 行）
- 修改：`src/main/proxy/__tests__/converter.test.ts`（追加测试）

**步骤：**

- [ ] **步骤 1：编写会失败的测试**

```typescript
// 追加到 converter.test.ts 末尾
describe('convertRequest A→O', () => {
  const minimalClaudeBody = {
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'user', content: 'Hello' },
    ],
    max_tokens: 1024,
  }

  it('should convert path from /v1/messages to /v1/chat/completions', () => {
    const result = convertRequest(minimalClaudeBody, 'anthropic', 'openai')
    expect(result.path).toBe('/v1/chat/completions')
  })

  it('should convert system field to system role message', () => {
    const body = {
      ...minimalClaudeBody,
      system: [{ type: 'text', text: 'You are helpful.' }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    })
  })

  it('should convert string system field', () => {
    const body = {
      ...minimalClaudeBody,
      system: 'You are helpful.',
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    })
  })

  it('should passthrough basic fields', () => {
    const body = {
      ...minimalClaudeBody,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 50,
      stream: true,
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.model).toBe('claude-sonnet-4-5')
    expect(result.body.temperature).toBeCloseTo(0.7)
    expect(result.body.top_p).toBeCloseTo(0.9)
    expect(result.body.top_k).toBe(50)
    expect(result.body.stream).toBe(true)
  })

  it('should convert stop_sequences to stop string for single item', () => {
    const body = { ...minimalClaudeBody, stop_sequences: ['END'] }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.stop).toBe('END')
  })

  it('should convert stop_sequences to stop array for multiple items', () => {
    const body = { ...minimalClaudeBody, stop_sequences: ['END', 'STOP'] }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.stop).toEqual(['END', 'STOP'])
  })

  it('should convert Claude tools to OpenAI function tools', () => {
    const body = {
      ...minimalClaudeBody,
      tools: [{
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.tools).toHaveLength(1)
    expect(result.body.tools[0].type).toBe('function')
    expect(result.body.tools[0].function.name).toBe('get_weather')
  })

  it('should convert thinking enabled to reasoning_effort', () => {
    const body = {
      ...minimalClaudeBody,
      thinking: { type: 'enabled', budget_tokens: 2048 },
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.reasoning_effort).toBe('medium')
  })

  it('should convert tool_use in message to tool_calls', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { city: 'NYC' } },
          ],
        },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const assistantMsg = result.body.messages[1]
    expect(assistantMsg.tool_calls).toBeDefined()
    expect(assistantMsg.tool_calls[0].id).toBe('toolu_01')
    expect(assistantMsg.tool_calls[0].function.name).toBe('get_weather')
  })

  it('should convert tool_result to tool role message', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the weather?' },
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'Sunny, 72F' },
          ],
        },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const toolMsg = result.body.messages.find((m: any) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg.tool_call_id).toBe('toolu_01')
  })

  it('should handle web_search tool conversion', () => {
    const body = {
      ...minimalClaudeBody,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        user_location: { type: 'approximate', country: 'US' },
      }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.web_search_options).toBeDefined()
    expect(result.body.web_search_options.search_context_size).toBe('medium')
  })
})
```

- [ ] **步骤 2：运行测试确认它们失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：11 个新测试 FAIL — convertRequest A→O 方向返回错误

- [ ] **步骤 3：编写 anthropicToOpenAIRequest 实现**

在 `converter.ts` 中 `mapToolChoice` 之后追加：

```typescript
function anthropicToOpenAIRequest(
  anthropicBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic fields
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (anthropicBody[key] !== undefined) {
      result[key] = anthropicBody[key]
    }
  }
  if (anthropicBody.max_tokens !== undefined) {
    result.max_tokens = anthropicBody.max_tokens
  }

  // Stop sequences → stop
  if (anthropicBody.stop_sequences) {
    const seqs = anthropicBody.stop_sequences as string[]
    result.stop = seqs.length === 1 ? seqs[0] : seqs
  }

  // System → messages[0]
  const openaiMessages: Array<Record<string, any>> = []
  if (anthropicBody.system) {
    if (typeof anthropicBody.system === 'string') {
      if (anthropicBody.system) {
        openaiMessages.push({ role: 'system', content: anthropicBody.system })
      }
    } else if (Array.isArray(anthropicBody.system)) {
      const textParts = anthropicBody.system
        .filter((b: any) => b.type === 'text' && b.text)
        .map((b: any) => b.text)
      if (textParts.length > 0) {
        openaiMessages.push({ role: 'system', content: textParts.join('\n') })
      }
    }
  }

  // Convert messages
  for (const msg of anthropicBody.messages ?? []) {
    if (typeof msg.content === 'string') {
      openaiMessages.push({ role: msg.role, content: msg.content || '...' })
    } else if (Array.isArray(msg.content)) {
      const texts: string[] = []
      const toolCalls: Array<Record<string, any>> = []
      const mediaContents: Array<Record<string, any>> = []

      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            texts.push(block.text ?? '')
            break
          case 'tool_use':
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input ?? {}),
              },
            })
            break
          case 'tool_result':
            openaiMessages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            })
            break
          case 'image':
            if (block.source) {
              const mimeType = block.source.media_type ?? 'image/jpeg'
              const data = block.source.data ?? ''
              mediaContents.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` },
              })
            }
            break
          case 'thinking':
            // thinking blocks don't map to OpenAI — skip
            break
        }
      }

      if (toolCalls.length > 0) {
        const assistantMsg: Record<string, any> = { role: msg.role, content: null }
        if (texts.length > 0) {
          assistantMsg.content = texts.join(' ')
        }
        assistantMsg.tool_calls = toolCalls
        openaiMessages.push(assistantMsg)
      } else if (mediaContents.length > 0) {
        // For media content, use array format
        const allContent = [
          ...texts.map((t: string) => ({ type: 'text', text: t })),
          ...mediaContents,
        ]
        openaiMessages.push({ role: msg.role, content: allContent })
      } else if (texts.length > 0) {
        openaiMessages.push({ role: msg.role, content: texts.join(' ') })
      }
    }
  }

  result.messages = openaiMessages

  // Tools
  if (anthropicBody.tools) {
    const webSearchTools: Array<Record<string, any>> = []
    const regularTools = anthropicBody.tools.filter((t: any) => {
      if (t.type === 'web_search_20250305') {
        webSearchTools.push(t)
        return false
      }
      return true
    })
    if (regularTools.length > 0) {
      result.tools = regularTools.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      }))
    }
    // Web search
    if (webSearchTools.length > 0) {
      const ws = webSearchTools[0]
      const contextMap: Record<number, string> = { 1: 'low', 5: 'medium', 10: 'high' }
      result.web_search_options = {}
      if (ws.max_uses) {
        result.web_search_options.search_context_size = contextMap[ws.max_uses] ?? 'medium'
      }
      if (ws.user_location) {
        result.web_search_options.user_location = { approximate: ws.user_location }
      }
    }
  }

  // Thinking → reasoning_effort
  if (anthropicBody.thinking) {
    const thinking = anthropicBody.thinking
    if (thinking.type === 'enabled') {
      const bt = thinking.budget_tokens ?? 2048
      if (bt <= 1280) result.reasoning_effort = 'low'
      else if (bt <= 2048) result.reasoning_effort = 'medium'
      else result.reasoning_effort = 'high'
    }
  }

  // Tool choice reverse mapping
  if (anthropicBody.tool_choice) {
    const tc = anthropicBody.tool_choice
    const typeMap: Record<string, string> = { auto: 'auto', any: 'required', none: 'none' }
    if (tc.type === 'tool') {
      result.tool_choice = { type: 'function', function: { name: tc.name } }
    } else if (typeMap[tc.type]) {
      result.tool_choice = typeMap[tc.type]
    }
    if (tc.disable_parallel_tool_use !== undefined) {
      result.parallel_tool_calls = !tc.disable_parallel_tool_use
    }
  }

  return { body: result, path: '/v1/chat/completions' }
}
```

- [ ] **步骤 4：运行测试确认它们通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：43 个测试全部 PASS（14 reason + 18 O→A + 11 A→O）

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add anthropicToOpenAIRequest body conversion"
```

---
### Task 4: 非流式响应 + 错误响应转换

**文件：**
- 修改：`src/main/proxy/converter.ts`（追加 ~100 行）
- 修改：`src/main/proxy/__tests__/converter.test.ts`（追加测试）

**步骤：**

- [ ] **步骤 1：编写会失败的测试**

```typescript
// 追加到 converter.test.ts 末尾
import { convertResponse } from '../converter'

describe('convertResponse C→O', () => {
  it('should convert Claude text response to OpenAI format', () => {
    const claudeResp = {
      id: 'msg_123',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello! How can I help?' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.id).toBe('msg_123')
    expect(result.object).toBe('chat.completion')
    expect(result.choices).toHaveLength(1)
    expect(result.choices[0].message.content).toBe('Hello! How can I help?')
    expect(result.choices[0].finish_reason).toBe('stop')
    expect(result.usage.prompt_tokens).toBe(10)
    expect(result.usage.completion_tokens).toBe(5)
  })

  it('should convert Claude tool_use to OpenAI tool_calls', () => {
    const claudeResp = {
      id: 'msg_456',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'toolu_01',
        name: 'get_weather',
        input: { city: 'NYC' },
      }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.choices[0].message.tool_calls).toBeDefined()
    expect(result.choices[0].message.tool_calls[0].id).toBe('toolu_01')
    expect(result.choices[0].message.tool_calls[0].function.name).toBe('get_weather')
    expect(result.choices[0].finish_reason).toBe('tool_calls')
  })

  it('should convert Claude thinking to OpenAI reasoning_content', () => {
    const claudeResp = {
      id: 'msg_789',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 10 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.choices[0].message.reasoning_content).toBe('Let me think about this...')
  })
})

describe('convertResponse O→C', () => {
  it('should convert OpenAI text response to Claude format', () => {
    const openaiResp = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
    const result = convertResponse(openaiResp, 'openai', 'anthropic')
    expect(result.id).toBe('chatcmpl-abc')
    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('Hello!')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.usage.input_tokens).toBe(10)
    expect(result.usage.output_tokens).toBe(5)
  })

  it('should convert OpenAI tool_calls to Claude tool_use', () => {
    const openaiResp = {
      id: 'chatcmpl-def',
      object: 'chat.completion',
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
    }
    const result = convertResponse(openaiResp, 'openai', 'anthropic')
    expect(result.content[0].type).toBe('tool_use')
    expect(result.content[0].id).toBe('call_123')
    expect(result.content[0].name).toBe('get_weather')
    expect(result.content[0].input).toEqual({ city: 'NYC' })
  })
})

describe('convertResponse error conversion', () => {
  it('should convert Anthropic error to OpenAI error format', () => {
    const claudeErr = {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Model not found' },
    }
    const result = convertResponse(claudeErr, 'anthropic', 'openai')
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('invalid_request_error')
    expect(result.error.message).toBe('Model not found')
  })

  it('should convert OpenAI error to Anthropic error format', () => {
    const openaiErr = {
      error: { type: 'invalid_request_error', message: 'Model not found' },
    }
    const result = convertResponse(openaiErr, 'openai', 'anthropic')
    expect(result.type).toBe('error')
    expect(result.error.type).toBe('invalid_request_error')
    expect(result.error.message).toBe('Model not found')
  })
})
```

- [ ] **步骤 2：运行测试确认它们失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：7 个新测试 FAIL — `convertResponse is not a function`

- [ ] **步骤 3：编写响应转换 + 错误转换实现**

在 `converter.ts` 末尾追加：

```typescript
function anthropicToOpenAIResponse(
  anthropicBody: Record<string, any>
): Record<string, any> {
  // Error response
  if (anthropicBody.type === 'error') {
    const err = anthropicBody.error ?? {}
    return { error: { type: err.type ?? '', message: err.message ?? '', code: null } }
  }

  const response: Record<string, any> = {
    id: anthropicBody.id,
    object: 'chat.completion',
    model: anthropicBody.model,
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      message: { role: 'assistant', content: '' },
      finish_reason: mapFinishReason(anthropicBody.stop_reason ?? '', 'toOpenAI'),
    }],
    usage: {
      prompt_tokens: anthropicBody.usage?.input_tokens ?? 0,
      completion_tokens: anthropicBody.usage?.output_tokens ?? 0,
      total_tokens: (anthropicBody.usage?.input_tokens ?? 0) + (anthropicBody.usage?.output_tokens ?? 0),
    },
  }

  const choice = response.choices[0]
  const toolCalls: Array<Record<string, any>> = []

  for (const block of anthropicBody.content ?? []) {
    switch (block.type) {
      case 'text':
        choice.message.content = block.text ?? ''
        break
      case 'tool_use':
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        })
        break
      case 'thinking':
        if (block.thinking) {
          choice.message.reasoning_content = block.thinking
        }
        break
    }
  }

  if (toolCalls.length > 0) {
    choice.message.tool_calls = toolCalls
    if (!choice.message.content) choice.message.content = null
  }

  return response
}

function openAIToAnthropicResponse(
  openaiBody: Record<string, any>
): Record<string, any> {
  // Error response
  if (openaiBody.error && !openaiBody.choices) {
    const err = openaiBody.error
    return { type: 'error', error: { type: err.type ?? '', message: err.message ?? '' } }
  }

  const choice = openaiBody.choices?.[0] ?? {}
  const content: Array<Record<string, any>> = []

  // tool_calls → tool_use
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: any = {}
      try {
        input = JSON.parse(tc.function?.arguments || '{}')
      } catch { input = tc.function?.arguments ?? {} }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function?.name ?? '',
        input,
      })
    }
  } else if (choice.message?.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  // reasoning_content → thinking
  if (choice.message?.reasoning_content) {
    content.push({ type: 'thinking', thinking: choice.message.reasoning_content })
  }

  return {
    id: openaiBody.id,
    type: 'message',
    role: 'assistant',
    model: openaiBody.model,
    content,
    stop_reason: mapFinishReason(choice.finish_reason ?? '', 'toAnthropic'),
    usage: {
      input_tokens: openaiBody.usage?.prompt_tokens ?? 0,
      output_tokens: openaiBody.usage?.completion_tokens ?? 0,
    },
  }
}

// ---- Top-level exports ----

export function convertRequest(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { body: any; path: string } {
  if (from === to) return { body, path: from === 'openai' ? '/v1/chat/completions' : '/v1/messages' }
  if (from === 'openai' && to === 'anthropic') return openaiToAnthropicRequest(body)
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIRequest(body)
  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}

export function convertResponse(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): any {
  if (from === to) return body
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIResponse(body)
  if (from === 'openai' && to === 'anthropic') return openAIToAnthropicResponse(body)
  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}
```

- [ ] **步骤 4：运行测试确认它们通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：50 个测试全部 PASS（14 reason + 18 O→A + 11 A→O + 7 response）

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add non-streaming response + error conversion"
```

---
### Task 5: 流式 SSE 转换 — Claude → OpenAI

**文件：**
- 修改：`src/main/proxy/converter.ts`（追加 ~80 行）
- 修改：`src/main/proxy/__tests__/converter.test.ts`（追加测试）

**步骤：**

- [ ] **步骤 1：编写会失败的测试**

```typescript
// 追加到 converter.test.ts 末尾
import { convertSSEEvent } from '../converter'

describe('convertSSEEvent C→O', () => {
  it('should convert message_start to role delta', () => {
    const data = {
      type: 'message_start',
      message: { id: 'msg_001', model: 'claude-sonnet-4-5', role: 'assistant' },
    }
    const result = convertSSEEvent('message_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('')
    expect(result!.data.object).toBe('chat.completion.chunk')
    expect(result!.data.choices[0].delta.role).toBe('assistant')
    expect(result!.data.id).toBe('msg_001')
    expect(result!.data.model).toBe('claude-sonnet-4-5')
  })

  it('should convert content_block_start text to first content delta', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: 'Hello' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.content).toBe('Hello')
  })

  it('should convert content_block_start tool_use to ToolCallResponse', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_01', name: 'get_weather' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.tool_calls[0].id).toBe('toolu_01')
    expect(result!.data.choices[0].delta.tool_calls[0].function.name).toBe('get_weather')
  })

  it('should convert content_block_start thinking to reasoning delta', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.reasoning_content).toBe('')
  })

  it('should convert content_block_delta text_delta to content delta', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: ' world' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.content).toBe(' world')
  })

  it('should convert content_block_delta input_json_delta to tool call arguments', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"city"' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.tool_calls[0].function.arguments).toBe('{"city"')
  })

  it('should convert content_block_delta thinking_delta to reasoning delta', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Let me think...' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.reasoning_content).toBe('Let me think...')
  })

  it('should convert message_delta to finish_reason', () => {
    const data = {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 25 },
    }
    const result = convertSSEEvent('message_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].finish_reason).toBe('stop')
  })

  it('should return null for message_stop', () => {
    const data = { type: 'message_stop' }
    const result = convertSSEEvent('message_stop', data, 'anthropic', 'openai')
    expect(result).toBeNull()
  })

  it('should return null for unknown event types', () => {
    const result = convertSSEEvent('ping', {}, 'anthropic', 'openai')
    expect(result).toBeNull()
  })
})
```

- [ ] **步骤 2：运行测试确认它们失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：10 个新测试 FAIL — `convertSSEEvent is not a function`

- [ ] **步骤 3：编写 anthropicSSEToOpenAI 实现**

在 `converter.ts` 末尾（`convertResponse` 之后）追加：

```typescript
function anthropicSSEToOpenAI(
  event: string,
  data: Record<string, any>
): { event: string; data: any } | null {
  switch (data.type) {
    case 'message_start': {
      const msg = data.message ?? {}
      return {
        event: '',
        data: {
          id: msg.id,
          object: 'chat.completion.chunk',
          model: msg.model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
        },
      }
    }

    case 'content_block_start': {
      const block = data.content_block ?? {}
      const index = data.index ?? 0
      if (block.type === 'text') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { content: block.text ?? '' } }],
          },
        }
      } else if (block.type === 'tool_use') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{
              index,
              delta: {
                tool_calls: [{
                  index,
                  id: block.id,
                  type: 'function',
                  function: { name: block.name, arguments: '' },
                }],
              },
            }],
          },
        }
      } else if (block.type === 'thinking') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: block.thinking ?? '' } }],
          },
        }
      }
      return null
    }

    case 'content_block_delta': {
      const delta = data.delta ?? {}
      const index = data.index ?? 0
      if (delta.type === 'text_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { content: delta.text ?? '' } }],
          },
        }
      } else if (delta.type === 'input_json_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{
              index,
              delta: {
                tool_calls: [{
                  index,
                  function: { arguments: delta.partial_json ?? '' },
                }],
              },
            }],
          },
        }
      } else if (delta.type === 'thinking_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: delta.thinking ?? '' } }],
          },
        }
      } else if (delta.type === 'signature_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: '\n' } }],
          },
        }
      }
      return null
    }

    case 'message_delta': {
      const delta = data.delta ?? {}
      const stopReason = delta.stop_reason
      const finishReason = stopReason ? mapFinishReason(stopReason, 'toOpenAI') : null
      return {
        event: '',
        data: {
          object: 'chat.completion.chunk',
          choices: [{ index: 0, finish_reason: finishReason, delta: {} }],
          ...(data.usage ? {
            usage: {
              prompt_tokens: data.usage.input_tokens ?? 0,
              completion_tokens: data.usage.output_tokens ?? 0,
              total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
            },
          } : {}),
        },
      }
    }

    case 'message_stop':
      return null

    default:
      return null
  }
}
```

```typescript
// 在文件底部追加 (convertResponse 之后)
export function convertSSEEvent(
  event: string,
  data: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { event: string; data: any } | null {
  if (from === to) return { event, data }
  if (from === 'anthropic' && to === 'openai') return anthropicSSEToOpenAI(event, data)
  if (from === 'openai' && to === 'anthropic') return openAISSEToAnthropic(undefined as any, data)  // placeholder — Task 6 实现
  return null
}
```

- [ ] **步骤 4：运行测试确认它们通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：60 个测试全部 PASS（50 previous + 10 C→O SSE）

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add Claude→OpenAI streaming SSE conversion"
```

---
### Task 6: 流式 SSE 转换 — OpenAI → Claude（含状态机）

**文件：**
- 修改：`src/main/proxy/converter.ts`（追加 ~120 行）
- 修改：`src/main/proxy/__tests__/converter.test.ts`（追加测试）

**步骤：**

- [ ] **步骤 1：编写会失败的测试**

```typescript
// 追加到 converter.test.ts 末尾
describe('convertSSEEvent O→C', () => {
  it('should convert first chunk to message_start', () => {
    const data = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('message_start')
    const msg = result!.data.message
    expect(msg.model).toBe('gpt-4')
    expect(msg.role).toBe('assistant')
  })

  it('should convert text delta to content_block_start + text_delta', () => {
    // First send message_start
    const startData = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    convertSSEEvent('', startData, 'openai', 'anthropic')

    // Then text content
    const data = {
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { content: 'Hello' } }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic')
    // Should return an array: content_block_start + content_block_delta
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result[0].event).toBe('content_block_start')
      expect(result[1].event).toBe('content_block_delta')
      expect(result[1].data.delta.text).toBe('Hello')
    }
  })

  it('should return null for empty content chunks after message_start', () => {
    const data = {
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {} }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic')
    expect(result).toBeNull()
  })

  it('should convert finish_reason to message_delta + message_stop', () => {
    const data = {
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, finish_reason: 'stop', delta: {} }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic')
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      const messageDelta = result.find((r: any) => r.event === 'message_delta')
      expect(messageDelta).toBeDefined()
      expect(messageDelta.data.delta.stop_reason).toBe('end_turn')
      const messageStop = result.find((r: any) => r.event === 'message_stop')
      expect(messageStop).toBeDefined()
    }
  })

  it('should reuse cached model name from message_start', () => {
    // Model should come from the state machine's cache, not the current chunk
    const startData = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    convertSSEEvent('', startData, 'openai', 'anthropic')

    const data = {
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: 'Testing' } }],
    }
    // model field should be pulled from cache, not require it in data
    const result = convertSSEEvent('', data, 'openai', 'anthropic')
    expect(result).not.toBeNull()
  })
})
```

- [ ] **步骤 2：运行测试确认它们失败**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：5 个 O→C SSE 测试 FAIL — placeholder 返回数据不对

- [ ] **步骤 3：编写 openAISSEToAnthropic 实现（含 StreamState 状态机）**

在 `converter.ts` 中追加 `StreamState` 类型和 `openAISSEToAnthropic` 函数，替换之前的 placeholder：

```typescript
// StreamState for OpenAI→Anthropic SSC conversion
interface StreamState {
  lastMessagesType: 'none' | 'text' | 'thinking' | 'tools'
  index: number
  toolCallBaseIndex: number
  toolCallMaxIndexOffset: number
  done: boolean
  finishReason: string
  model: string
  id: string
}

const _streamState: StreamState = {
  lastMessagesType: 'none',
  index: 0,
  toolCallBaseIndex: 0,
  toolCallMaxIndexOffset: 0,
  done: false,
  finishReason: '',
  model: '',
  id: '',
}

function resetStreamState(): void {
  _streamState.lastMessagesType = 'none'
  _streamState.index = 0
  _streamState.toolCallBaseIndex = 0
  _streamState.toolCallMaxIndexOffset = 0
  _streamState.done = false
  _streamState.finishReason = ''
  _streamState.model = ''
  _streamState.id = ''
}

function contentBlockStop(index: number) {
  return { event: 'content_block_stop', data: { type: 'content_block_stop', index } }
}

function stopOpenBlocks(): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  const s = _streamState
  switch (s.lastMessagesType) {
    case 'text':
    case 'thinking':
      result.push(contentBlockStop(s.index))
      break
    case 'tools':
      for (let offset = 0; offset <= s.toolCallMaxIndexOffset; offset++) {
        result.push(contentBlockStop(s.toolCallBaseIndex + offset))
      }
      break
  }
  return result
}

function stopOpenBlocksAndAdvance(): Array<{ event: string; data: any }> {
  const s = _streamState
  if (s.lastMessagesType === 'none') return []
  const result = stopOpenBlocks()
  switch (s.lastMessagesType) {
    case 'tools':
      s.index = s.toolCallBaseIndex + s.toolCallMaxIndexOffset + 1
      s.toolCallBaseIndex = 0
      s.toolCallMaxIndexOffset = 0
      break
    default:
      s.index++
  }
  s.lastMessagesType = 'none'
  return result
}

const _sentMessageStart = { current: false }

function openAISSEToAnthropic(
  data: Record<string, any>
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  const s = _streamState
  if (s.done) return null

  const choice = data.choices?.[0]
  if (!choice) {
    // Usage-only chunk (no choices) — close stream if finish reason was set
    if (s.finishReason && data.usage) {
      s.done = true
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(s.finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
    return null
  }

  const delta = choice.delta ?? {}

  // First chunk → message_start
  if (!_sentMessageStart.current && (data.id || s.id)) {
    _sentMessageStart.current = true
    if (data.id) s.id = data.id
    if (data.model) s.model = data.model
    return {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: s.id,
          model: s.model,
          type: 'message',
          role: 'assistant',
          usage: { input_tokens: 0, output_tokens: 0 },
          content: [],
        },
      },
    }
  }

  const reasoning = delta.reasoning_content ?? ''
  const textContent = delta.content ?? ''
  const toolCalls: Array<Record<string, any>> = delta.tool_calls ?? []

  if (reasoning) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'thinking') {
      result.push(...stopOpenBlocksAndAdvance())
      result.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: s.index,
          content_block: { type: 'thinking', thinking: '' },
        },
      })
    }
    s.lastMessagesType = 'thinking'
    result.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: s.index,
        delta: { type: 'thinking_delta', thinking: reasoning },
      },
    })
    return result
  }

  if (textContent) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'text') {
      result.push(...stopOpenBlocksAndAdvance())
      result.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: s.index,
          content_block: { type: 'text', text: '' },
        },
      })
    }
    s.lastMessagesType = 'text'
    result.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: s.index,
        delta: { type: 'text_delta', text: textContent },
      },
    })
    return result
  }

  if (toolCalls.length > 0) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'tools') {
      result.push(...stopOpenBlocksAndAdvance())
      s.toolCallBaseIndex = s.index
      s.toolCallMaxIndexOffset = 0
    }
    s.lastMessagesType = 'tools'
    const base = s.toolCallBaseIndex
    let maxOffset = s.toolCallMaxIndexOffset

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]
      const offset = tc.index ?? i
      if (offset > maxOffset) maxOffset = offset
      const blockIndex = base + offset

      if (tc.function?.name) {
        result.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: {},
            },
          },
        })
      }
      if (tc.function?.arguments) {
        result.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
          },
        })
      }
    }
    s.toolCallMaxIndexOffset = maxOffset
    s.index = base + maxOffset
    return result
  }

  // Check for finish_reason
  const finishReason = choice.finish_reason
  if (finishReason && !s.done) {
    s.finishReason = finishReason
    // Don't close yet if usage is still coming
    if (data.usage) {
      s.done = true
      _sentMessageStart.current = false
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
  }

  return null
}
```

修改 `convertSSEEvent` 导出函数（替换之前的 placeholder）：

```typescript
export function convertSSEEvent(
  event: string,
  data: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  if (from === to) return { event, data }
  if (from === 'anthropic' && to === 'openai') {
    const result = anthropicSSEToOpenAI(event, data)
    return result ? { event: result.event || '', data: result.data } : null
  }
  if (from === 'openai' && to === 'anthropic') {
    // Reset state on [DONE] signal or new stream
    if (event === 'done' || (event === '' && data === null)) {
      resetStreamState()
      return null
    }
    return openAISSEToAnthropic(data) as any
  }
  return null
}
```

并添加 `resetStreamState` 导出：

```typescript
export { resetStreamState }
```

- [ ] **步骤 4：运行测试确认它们通过**

```bash
npx vitest run src/main/proxy/__tests__/converter.test.ts
```
预期：65 个测试全部 PASS

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: add OpenAI→Claude streaming SSE conversion with state machine"
```

---
### Task 7: server.ts 集成 — handleProxyRequest 转换判断

**文件：**
- 修改：`src/main/proxy/server.ts`（~40 行改动）
- 修改：`src/main/proxy/__tests__/server.test.ts`（追加集成测试）

**步骤：**

- [ ] **步骤 1：修改 handleProxyRequest 加入转换逻辑**

在 `server.ts` 顶部 import 中加入：

```typescript
import { convertRequest, convertResponse, convertSSEEvent, resetStreamState } from './converter'
```

修改 `handleProxyRequest` 函数：

```typescript
async function handleProxyRequest(
  c: Context<AppEnv>,
  path: string,
  apiFormat: 'anthropic' | 'openai'
): Promise<Response> {
  const startTime = Date.now()
  try {
    const body = await c.req.json()
    const model = body.model
    if (!model) {
      return c.json({ error: 'model is required' }, 400)
    }

    const route = resolveProvider(model)
    const decryptedKey = route.provider.apiKey

    // --- 新增: 协议转换判断 ---
    const needsConversion = apiFormat !== route.provider.providerType
    let proxyPath = path
    let proxyBody: any = { ...body, model: route.modelName }

    if (needsConversion) {
      try {
        const converted = convertRequest(proxyBody, apiFormat, route.provider.providerType as 'openai' | 'anthropic')
        proxyBody = converted.body
        proxyPath = converted.path
      } catch (convErr: any) {
        return c.json({ error: `protocol_conversion_failed: ${convErr.message}` }, 502)
      }
    }
    // --- 转换判断结束 ---

    const url = buildProxyUrl(route.provider, proxyPath)

    const originalHeaders: Record<string, string> = {}
    const contentType = c.req.header('content-type')
    if (contentType) {
      originalHeaders['content-type'] = contentType
    }
    // 透传 anthropic-beta header（如果客户端发送了）
    const anthropicBeta = c.req.header('anthropic-beta')
    if (anthropicBeta && route.provider.providerType === 'anthropic') {
      originalHeaders['anthropic-beta'] = anthropicBeta
    }

    const proxyHeaders = buildProxyHeaders(
      route.provider,
      decryptedKey,
      originalHeaders
    )
    const proxyBodyJson = JSON.stringify(proxyBody)

    const response = await fetch(url, {
      method: 'POST',
      headers: proxyHeaders,
      body: proxyBodyJson
    })

    const logBase = {
      apiKeyId: c.var.apiKey.id,
      providerId: route.provider.id,
      model,
      apiFormat,
      statusCode: response.status,
      durationMs: Date.now() - startTime
    }

    // Handle error status codes — convert error response
    if (!response.ok && !proxyBody.stream) {
      const errorBody = await response.json()
      const convertedError = needsConversion
        ? convertResponse(errorBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
        : errorBody
      return c.json(convertedError, response.status as any)
    }

    // Handle streaming
    if (proxyBody.stream && response.body) {
      const [forClient, forLogging] = response.body.tee()

      if (needsConversion) {
        // Convert SSE events from upstream format to client format
        resetStreamState()
        const convertedStream = convertSSEStream(
          forClient,
          route.provider.providerType as 'openai' | 'anthropic',
          apiFormat
        )
        extractAndLogSSE(forLogging, logBase, apiFormat).catch(() => {})
        return new Response(convertedStream, {
          status: response.status,
          headers: response.headers
        })
      }

      // No conversion — existing behavior
      extractAndLogSSE(forLogging, logBase, apiFormat).catch(() => {})
      return new Response(forClient, {
        status: response.status,
        headers: response.headers
      })
    }

    // Handle non-streaming
    const responseBody = await response.json()
    const convertedBody = needsConversion
      ? convertResponse(responseBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
      : responseBody

    let tokensIn = 0
    let tokensOut = 0
    if (apiFormat === 'openai' && convertedBody.usage) {
      tokensIn = convertedBody.usage.prompt_tokens ?? 0
      tokensOut = convertedBody.usage.completion_tokens ?? 0
    } else if (apiFormat === 'anthropic' && convertedBody.usage) {
      tokensIn = convertedBody.usage.input_tokens ?? 0
      tokensOut = convertedBody.usage.output_tokens ?? 0
    }
    tryLogEntry(c, { ...logBase, tokensIn, tokensOut })
    return c.json(convertedBody, response.status as any)
  } catch (err) {
    return handleProxyError(c, err, startTime, apiFormat)
  }
}
```

- [ ] **步骤 2：添加 convertSSEStream 辅助函数**

在 `server.ts` 的 `extractAndLogSSE` 函数之后追加：

```typescript
// SSE stream converter: reads upstream SSE, converts, writes to client
function convertSSEStream(
  upstreamStream: ReadableStream<Uint8Array>,
  from: 'openai' | 'anthropic',
  to: 'openai' | 'anthropic'
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let buffer = ''
  // Track whether [DONE] signal seen (O→C requires special handling)
  let streamDone = false

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamStream.getReader()
      const decoder = new TextDecoder()
      let currentEvent = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete line in buffer

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7)
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)

              if (from === 'openai' && dataStr === '[DONE]') {
                // Signal: close the stream
                const results = convertSSEEvent('done' as any, null as any, 'openai', 'anthropic')
                if (results) {
                  // emit any trailing events
                  const arr = Array.isArray(results) ? results : [results]
                  for (const r of arr) {
                    if (!r) continue
                    const evt = r.event
                    const evtStr = evt ? `event: ${evt}\n` : ''
                    const dataJson = JSON.stringify(r.data)
                    controller.enqueue(encoder.encode(`${evtStr}data: ${dataJson}\n\n`))
                  }
                }
                streamDone = true
                continue
              }

              if (streamDone) continue

              let parsedData: any
              try {
                parsedData = JSON.parse(dataStr)
              } catch {
                continue // skip malformed
              }

              const results = convertSSEEvent(currentEvent, parsedData, from, to)
              if (!results) continue

              const arr = Array.isArray(results) ? results : [results]
              for (const r of arr) {
                if (!r) continue
                const evt = r.event && r.event !== '' ? `event: ${r.event}\n` : ''
                const dataJson = JSON.stringify(r.data)
                controller.enqueue(encoder.encode(`${evt}data: ${dataJson}\n\n`))
              }

              currentEvent = '' // reset event type for next block
            }
            // empty line = event boundary, reset event type
            if (line === '') {
              currentEvent = ''
            }
          }
        }

        // Flush remaining buffer
        if (buffer && !streamDone) {
          for (const line of buffer.split('\n')) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              if (from === 'openai' && dataStr === '[DONE]') break
              let parsedData: any
              try { parsedData = JSON.parse(dataStr) } catch { continue }
              const results = convertSSEEvent(currentEvent, parsedData, from, to)
              if (!results) continue
              const arr = Array.isArray(results) ? results : [results]
              for (const r of arr) {
                if (!r) continue
                const evt = r.event && r.event !== '' ? `event: ${r.event}\n` : ''
                controller.enqueue(encoder.encode(`${evt}data: ${JSON.stringify(r.data)}\n\n`))
              }
            }
          }
        }

        controller.close()
      } catch (err) {
        controller.error(err)
      }
    }
  })
}
```

- [ ] **步骤 3：运行测试确认构建通过**

```bash
npm run build
```
预期：构建成功

- [ ] **步骤 4：运行全量测试**

```bash
npx vitest run
```
预期：所有测试 PASS（~190+ tests including existing proxy tests）

- [ ] **步骤 5：提交**

```bash
git add src/main/proxy/server.ts src/main/proxy/converter.ts src/main/proxy/__tests__/converter.test.ts
git commit -m "feat: integrate protocol auto-conversion into proxy server"
```

---
## 自审清单

- [x] **1. 规格覆盖：** 每个规格节对应任务 — 映射表→T1, O→A 请求→T2, A→O 请求→T3, 非流式响应+错误→T4, C→O SSE→T5, O→C SSE→T6, server 集成→T7。response_format→T2, header 转换→T7, 不兼容字段→T2, cache_control→T2, 边界情况→各任务。
- [x] **2. 占位符扫描：** 无 TODO/待定/以后再实现。所有步骤含实际代码。
- [x] **3. 类型一致性：** `convertRequest` 返回 `{ body, path }`，T7 正确解构。`convertSSEEvent` 返回 `{ event, data } | Array | null`，T7 的 `convertSSEStream` 正确处理。`mapFinishReason` 签名在 T1 定义，T4/T5/T6 使用一致。StreamState 在 T6 定义，T7 通过 `resetStreamState` 重置。
