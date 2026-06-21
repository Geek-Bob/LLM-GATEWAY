// @vitest-environment node
/**
 * Task 3 — anthropicToOpenAIResponse 的 usage cache 字段映射
 *
 * 验收标准（来自 docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md）：
 * - cache_read_input_tokens → prompt_tokens_details.cached_tokens
 * - cache_creation_input_tokens → 透传保留
 * - 两字段都缺省时不改动 usage（透明）
 * - cache_read_input_tokens 为 0 时不省略
 * - total_tokens 仍 = input_tokens + output_tokens，不受 cache 影响
 * - 现有 tool_use / thinking / text 转换不受影响
 */
import { describe, it, expect } from 'vitest'
import { convertResponse } from '../index'

describe('anthropicToOpenAIResponse — usage cache 字段映射', () => {
  it('should map cache_read_input_tokens to prompt_tokens_details.cached_tokens', () => {
    const anthropicBody = {
      id: 'msg_cache_1',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 2000,
        output_tokens: 50,
        cache_read_input_tokens: 1500,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.usage.prompt_tokens_details).toBeDefined()
    expect(result.usage.prompt_tokens_details.cached_tokens).toBe(1500)
  })

  it('should pass through cache_creation_input_tokens verbatim', () => {
    const anthropicBody = {
      id: 'msg_cache_2',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 2000,
        output_tokens: 50,
        cache_creation_input_tokens: 800,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.usage.cache_creation_input_tokens).toBe(800)
  })

  it('should not add prompt_tokens_details nor cache_creation_input_tokens when both fields are absent', () => {
    const anthropicBody = {
      id: 'msg_no_cache',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.usage.prompt_tokens_details).toBeUndefined()
    expect(result.usage.cache_creation_input_tokens).toBeUndefined()
  })

  it('should preserve cached_tokens === 0 (not omitted)', () => {
    const anthropicBody = {
      id: 'msg_cache_zero',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 0,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.usage.prompt_tokens_details).toBeDefined()
    expect(result.usage.prompt_tokens_details.cached_tokens).toBe(0)
  })

  it('should keep total_tokens = input_tokens + output_tokens, unaffected by cache fields', () => {
    const anthropicBody = {
      id: 'msg_total',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 2000,
        output_tokens: 50,
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 800,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.usage.prompt_tokens).toBe(2000)
    expect(result.usage.completion_tokens).toBe(50)
    expect(result.usage.total_tokens).toBe(2050)
  })

  it('should not break tool_use / thinking / text conversion when cache fields are present', () => {
    const anthropicBody = {
      id: 'msg_mixed',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'reasoning...' },
        { type: 'text', text: 'final answer' },
        { type: 'tool_use', id: 'toolu_1', name: 'fn', input: { x: 1 } },
      ],
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 100,
        output_tokens: 30,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 20,
      },
    }

    const result = convertResponse(anthropicBody, 'anthropic', 'openai')

    expect(result.choices[0].message.content).toBe('final answer')
    expect(result.choices[0].message.reasoning_content).toBe('reasoning...')
    expect(result.choices[0].message.tool_calls).toBeDefined()
    expect(result.choices[0].message.tool_calls[0].id).toBe('toolu_1')
    expect(result.choices[0].message.tool_calls[0].function.name).toBe('fn')
    expect(result.choices[0].finish_reason).toBe('tool_calls')
  })
})
