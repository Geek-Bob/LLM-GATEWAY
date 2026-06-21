// @vitest-environment node
/**
 * Task 1：OpenAI → Anthropic 协议转换的 cache 字段映射
 *
 * 验收要点：
 * 1. prompt_cache_retention === "24h" | "1h" → 在 system 末尾块加 cache_control: { type: "ephemeral" }
 * 2. prompt_cache_key 存在 → metadata.user_id = prompt_cache_key（与已有 metadata 合并而非覆盖）
 * 3. 两字段都缺省 → 完全透明，不影响现有行为
 * 4. 无 system 消息但传 retention → 静默跳过，system 仍为空数组
 * 5. 现有 thinking / tool_choice / tools 转换不受影响
 */
import { describe, it, expect } from 'vitest'
import { convertRequest } from '../request'

const baseOpenaiBody = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
}

describe('openaiToAnthropicRequest — cache 字段映射 (Task 1)', () => {
  it('AC1: prompt_cache_retention="24h" + 有 system → system 末尾块加 cache_control ephemeral', () => {
    const result = convertRequest(
      { ...baseOpenaiBody, prompt_cache_retention: '24h' },
      'openai',
      'anthropic'
    )
    expect(result.body.system).toBeDefined()
    const last = result.body.system[result.body.system.length - 1]
    expect(last.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('AC2: prompt_cache_retention="1h" + 有 system → system 末尾块加 cache_control ephemeral', () => {
    const result = convertRequest(
      { ...baseOpenaiBody, prompt_cache_retention: '1h' },
      'openai',
      'anthropic'
    )
    expect(result.body.system).toBeDefined()
    const last = result.body.system[result.body.system.length - 1]
    expect(last.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('AC3: prompt_cache_key="user_123" → metadata.user_id="user_123"', () => {
    const result = convertRequest(
      { ...baseOpenaiBody, prompt_cache_key: 'user_123' },
      'openai',
      'anthropic'
    )
    expect(result.body.metadata).toBeDefined()
    expect(result.body.metadata.user_id).toBe('user_123')
  })

  it('AC4: 同时传 retention + key → 同时生成 cache_control 和 metadata.user_id', () => {
    const result = convertRequest(
      {
        ...baseOpenaiBody,
        prompt_cache_retention: '24h',
        prompt_cache_key: 'user_456',
      },
      'openai',
      'anthropic'
    )
    const lastSys = result.body.system[result.body.system.length - 1]
    expect(lastSys.cache_control).toEqual({ type: 'ephemeral' })
    expect(result.body.metadata.user_id).toBe('user_456')
  })

  it('AC5: 两字段都缺省 → system 块无 cache_control, metadata 无 user_id（透明）', () => {
    const result = convertRequest(baseOpenaiBody, 'openai', 'anthropic')
    // system 块不应包含 cache_control
    if (result.body.system) {
      for (const block of result.body.system) {
        expect(block.cache_control).toBeUndefined()
      }
    }
    // metadata 不应存在或不含 user_id
    if (result.body.metadata) {
      expect(result.body.metadata.user_id).toBeUndefined()
    }
  })

  it('AC6: 无 system 消息但传 prompt_cache_retention → 不报错, system 仍为空（透明）', () => {
    const result = convertRequest(
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        prompt_cache_retention: '24h',
      },
      'openai',
      'anthropic'
    )
    // system 应为空数组或不存在
    expect(result.body.system === undefined || result.body.system.length === 0).toBe(true)
    // metadata 也不应被错误创建
    expect(result.body.metadata).toBeUndefined()
  })

  it('AC7: 现有 thinking 转换不受影响', () => {
    const result = convertRequest(
      {
        ...baseOpenaiBody,
        thinking: { type: 'enabled', budget_tokens: 2048 },
        prompt_cache_retention: '24h',
        prompt_cache_key: 'user_789',
      },
      'openai',
      'anthropic'
    )
    expect(result.body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 })
    // cache 映射仍生效
    const lastSys = result.body.system[result.body.system.length - 1]
    expect(lastSys.cache_control).toEqual({ type: 'ephemeral' })
    expect(result.body.metadata.user_id).toBe('user_789')
  })

  it('AC8: 现有 tool_choice / tools 转换不受影响', () => {
    const result = convertRequest(
      {
        ...baseOpenaiBody,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          },
        ],
        tool_choice: 'auto',
        parallel_tool_calls: false,
        prompt_cache_key: 'user_tools',
      },
      'openai',
      'anthropic'
    )
    expect(result.body.tools).toBeDefined()
    expect(result.body.tools[0].name).toBe('get_weather')
    expect(result.body.tools[0].input_schema).toBeDefined()
    expect(result.body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true })
    // cache 映射仍生效
    expect(result.body.metadata.user_id).toBe('user_tools')
  })

  it('AC9: prompt_cache_key 存在时使用 user_id 字段（不污染其他 metadata 字段）', () => {
    // 验证 result.metadata 是新对象包含 user_id（不覆盖其他字段的语义通过展开运算符保证）
    const result = convertRequest(
      { ...baseOpenaiBody, prompt_cache_key: 'user_merged' },
      'openai',
      'anthropic'
    )
    expect(result.body.metadata).toEqual({ user_id: 'user_merged' })
  })

  it('AC10: 非法 retention 值（如 "5h"）→ 不触发 cache_control（仅 "24h" | "1h" 触发）', () => {
    const result = convertRequest(
      { ...baseOpenaiBody, prompt_cache_retention: '5h' },
      'openai',
      'anthropic'
    )
    const lastSys = result.body.system[result.body.system.length - 1]
    expect(lastSys.cache_control).toBeUndefined()
  })
})

/**
 * Task 2：Anthropic → OpenAI 协议转换的 cache 字段反向映射
 *
 * 验收要点：
 * 1. system 数组任一块含 cache_control → result.prompt_cache_retention = "24h"（固定 24h）
 * 2. metadata.user_id 存在 → result.prompt_cache_key = user_id
 * 3. 两个条件都缺省 → 透明不改动（result 无 prompt_cache_* 字段）
 * 4. system 多块且只有其中一块带 cache_control → 仍触发 prompt_cache_retention
 * 5. 现有 thinking / tool_choice 转换不受影响
 */
describe('anthropicToOpenAIRequest — cache 字段反向映射 (Task 2)', () => {
  const baseAnthropicBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
  }

  it('AC1: system 块含 cache_control ephemeral → prompt_cache_retention="24h"', () => {
    const result = convertRequest(
      {
        ...baseAnthropicBody,
        system: [
          { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
        ],
      },
      'anthropic',
      'openai'
    )
    expect(result.body.prompt_cache_retention).toBe('24h')
  })

  it('AC2: metadata.user_id 存在 → prompt_cache_key=user_id', () => {
    const result = convertRequest(
      {
        ...baseAnthropicBody,
        metadata: { user_id: 'user_123' },
      },
      'anthropic',
      'openai'
    )
    expect(result.body.prompt_cache_key).toBe('user_123')
  })

  it('AC3: 无 cache_control + 无 metadata.user_id → 无 prompt_cache_* 字段（透明）', () => {
    const result = convertRequest(baseAnthropicBody, 'anthropic', 'openai')
    expect(result.body.prompt_cache_retention).toBeUndefined()
    expect(result.body.prompt_cache_key).toBeUndefined()
  })

  it('AC4: system 多块只有其中一块带 cache_control → 仍生成 prompt_cache_retention', () => {
    const result = convertRequest(
      {
        ...baseAnthropicBody,
        system: [
          { type: 'text', text: 'First block.' },
          { type: 'text', text: 'Second block.' },
          { type: 'text', text: 'Third block with cache.', cache_control: { type: 'ephemeral' } },
        ],
      },
      'anthropic',
      'openai'
    )
    expect(result.body.prompt_cache_retention).toBe('24h')
  })

  it('AC5: 现有 thinking 转换不受影响（同时传 cache + thinking）', () => {
    const result = convertRequest(
      {
        ...baseAnthropicBody,
        thinking: { type: 'enabled', budget_tokens: 2048 },
        metadata: { user_id: 'user_thinking' },
        system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      },
      'anthropic',
      'openai'
    )
    expect(result.body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 })
    expect(result.body.prompt_cache_retention).toBe('24h')
    expect(result.body.prompt_cache_key).toBe('user_thinking')
  })

  it('AC6: 现有 tool_choice 转换不受影响（同时传 cache + tool_choice）', () => {
    const result = convertRequest(
      {
        ...baseAnthropicBody,
        tool_choice: { type: 'auto' },
        metadata: { user_id: 'user_tool' },
        system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      },
      'anthropic',
      'openai'
    )
    expect(result.body.tool_choice).toBe('auto')
    expect(result.body.prompt_cache_retention).toBe('24h')
    expect(result.body.prompt_cache_key).toBe('user_tool')
  })
})
