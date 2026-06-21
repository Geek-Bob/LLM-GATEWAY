// @vitest-environment node
/**
 * Task 5：SSE Anthropic → OpenAI 方向的 cache 字段透传
 *
 * 验收要点：
 * 1. message_start.message.usage.cache_read_input_tokens 存在 → 首 chunk 顶层加
 *    usage.prompt_tokens_details.cached_tokens（首帧此前无 usage 块，需新增）
 * 2. message_delta.usage.cache_read_input_tokens 存在 → 终止 chunk 在已有 usage 块中加
 *    prompt_tokens_details.cached_tokens
 * 3. cache_read_input_tokens === 0 → 仍带 cached_tokens: 0（不省略 0 值）
 * 4. cache 字段都缺省 → OpenAI chunk 不加 prompt_tokens_details（透明）
 * 5. 现有 text / tool_use / thinking delta 转换不受影响
 */
import { describe, it, expect } from 'vitest'
import { convertSSEEvent } from '../sse'

describe('SSE Anthropic → OpenAI — cache 字段透传 (Task 5)', () => {
  describe('message_start 首帧', () => {
    it('AC1: message.usage.cache_read_input_tokens=1365 → 首 chunk usage.prompt_tokens_details.cached_tokens=1365', () => {
      const anthropicData = {
        type: 'message_start',
        message: {
          id: 'msg_01',
          model: 'claude-sonnet-4-20250514',
          role: 'assistant',
          type: 'message',
          content: [],
          usage: {
            input_tokens: 1500,
            output_tokens: 1,
            cache_read_input_tokens: 1365,
            cache_creation_input_tokens: 0,
          },
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.usage).toBeDefined()
      expect(chunk.usage.prompt_tokens_details).toBeDefined()
      expect(chunk.usage.prompt_tokens_details.cached_tokens).toBe(1365)
    })

    it('AC3a: cache_read_input_tokens=0 → 仍带 cached_tokens: 0（不省略）', () => {
      const anthropicData = {
        type: 'message_start',
        message: {
          id: 'msg_02',
          model: 'claude-sonnet-4-20250514',
          role: 'assistant',
          type: 'message',
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 1,
            cache_read_input_tokens: 0,
          },
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.usage).toBeDefined()
      expect(chunk.usage.prompt_tokens_details.cached_tokens).toBe(0)
    })

    it('AC4a: usage 缺省 cache 字段 → 不加 prompt_tokens_details（透明）', () => {
      const anthropicData = {
        type: 'message_start',
        message: {
          id: 'msg_03',
          model: 'claude-sonnet-4-20250514',
          role: 'assistant',
          type: 'message',
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 1,
          },
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      // 首帧无 cache 字段 → 不加 prompt_tokens_details
      expect(chunk.usage?.prompt_tokens_details).toBeUndefined()
    })
  })

  describe('message_delta 终止帧', () => {
    it('AC2: data.usage.cache_read_input_tokens=114 → 终止 chunk 含 cached_tokens=114', () => {
      const anthropicData = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 1500,
          output_tokens: 200,
          cache_read_input_tokens: 114,
          cache_creation_input_tokens: 50,
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.usage).toBeDefined()
      expect(chunk.usage.prompt_tokens).toBe(1500)
      expect(chunk.usage.completion_tokens).toBe(200)
      expect(chunk.usage.total_tokens).toBe(1700)
      expect(chunk.usage.prompt_tokens_details).toBeDefined()
      expect(chunk.usage.prompt_tokens_details.cached_tokens).toBe(114)
    })

    it('AC3b: 终止帧 cache_read_input_tokens=0 → 仍带 cached_tokens: 0', () => {
      const anthropicData = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 50,
          output_tokens: 30,
          cache_read_input_tokens: 0,
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.usage.prompt_tokens_details.cached_tokens).toBe(0)
    })

    it('AC4b: 终止帧 usage 缺省 cache 字段 → 已有 usage 块无 prompt_tokens_details（透明）', () => {
      const anthropicData = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: 50,
          output_tokens: 30,
        },
      }

      const result = convertSSEEvent('', anthropicData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.usage).toBeDefined()
      // 无 cache 字段 → 现有 usage 块不含 prompt_tokens_details
      expect(chunk.usage.prompt_tokens_details).toBeUndefined()
    })
  })

  describe('现有 delta 转换不受影响 (AC5)', () => {
    it('text_delta 转换应正常输出 content 字段，不受 message_start cache 改动影响', () => {
      const textData = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello world' },
      }

      const result = convertSSEEvent('', textData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.choices[0].delta.content).toBe('Hello world')
    })

    it('tool_use input_json_delta 转换应正常输出 tool_calls.arguments', () => {
      const toolData = {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"a":1}' },
      }

      const result = convertSSEEvent('', toolData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.choices[0].delta.tool_calls[0].function.arguments).toBe('{"a":1}')
    })

    it('thinking_delta 转换应正常输出 reasoning_content', () => {
      const thinkData = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'let me think' },
      }

      const result = convertSSEEvent('', thinkData, 'anthropic', 'openai')

      expect(result).not.toBeNull()
      const chunk = (result as { event: string; data: any }).data
      expect(chunk.choices[0].delta.reasoning_content).toBe('let me think')
    })
  })
})

// @vitest-environment node
/**
 * Task 6：SSE OpenAI → Anthropic 方向的 cache 字段反向映射
 *
 * 验收要点：
 * 1. OpenAI 终止 chunk `usage.prompt_tokens_details.cached_tokens` 存在 →
 *    Anthropic `message_delta.usage.cache_read_input_tokens` 同值映射
 * 2. OpenAI 首 chunk `usage.prompt_tokens_details.cached_tokens` 存在（罕见但可能）→
 *    Anthropic `message.usage.cache_read_input_tokens` 同值映射
 * 3. `prompt_tokens_details` 缺省 → Anthropic usage 块无 cache_read_input_tokens（透明）
 * 4. OpenAI 协议不输出 cache_creation_input_tokens → 反向不保留该字段
 */
// 复用文件顶部已 import 的 vitest 符号与 convertSSEEvent；额外需要 createStreamContext
import { createStreamContext } from '../sse'

describe('SSE OpenAI → Anthropic — cached_tokens 反向映射 (Task 6)', () => {
  describe('终止 chunk 走 formatOpenAIUsageOnlyClose', () => {
    it('AC1: prompt_tokens_details.cached_tokens=8 → message_delta.usage.cache_read_input_tokens=8', () => {
      const ctx = createStreamContext()
      // 先送 finishReason 帧（s.finishReason 由 handleFinishReason 写入），再送 usage-only 帧
      const finishChunk = {
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }
      convertSSEEvent('', finishChunk, 'openai', 'anthropic', ctx)

      // 终止 chunk：无 choices、有 usage
      const usageChunk = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 8 },
        },
      }
      const result = convertSSEEvent('', usageChunk, 'openai', 'anthropic', ctx)

      expect(result).not.toBeNull()
      // 终止路径返回数组 [stopBlocks..., message_delta, message_stop]
      const arr = result as Array<{ event: string; data: any }>
      const messageDelta = arr.find((e) => e.event === 'message_delta')
      expect(messageDelta).toBeDefined()
      expect(messageDelta!.data.usage).toBeDefined()
      expect(messageDelta!.data.usage.input_tokens).toBe(100)
      expect(messageDelta!.data.usage.output_tokens).toBe(50)
      expect(messageDelta!.data.usage.cache_read_input_tokens).toBe(8)
    })

    it('AC3a: prompt_tokens_details 缺省 → message_delta.usage 无 cache_read_input_tokens（透明）', () => {
      const ctx = createStreamContext()
      const finishChunk = {
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }
      convertSSEEvent('', finishChunk, 'openai', 'anthropic', ctx)

      const usageChunk = {
        usage: { prompt_tokens: 50, completion_tokens: 30 },
      }
      const result = convertSSEEvent('', usageChunk, 'openai', 'anthropic', ctx)

      expect(result).not.toBeNull()
      const arr = result as Array<{ event: string; data: any }>
      const messageDelta = arr.find((e) => e.event === 'message_delta')
      expect(messageDelta).toBeDefined()
      expect(messageDelta!.data.usage.cache_read_input_tokens).toBeUndefined()
    })
  })

  describe('首 chunk 走 formatOpenAIMessageStart', () => {
    it('AC2: prompt_tokens_details.cached_tokens=1365 → message.usage.cache_read_input_tokens=1365（罕见但覆盖）', () => {
      const ctx = createStreamContext()
      // 首 chunk：含 id/model/usage 顶层 + choices[0].delta 触发 message_start 分支
      const firstChunk = {
        id: 'chatcmpl-abc',
        model: 'gpt-4o',
        usage: {
          prompt_tokens: 1500,
          completion_tokens: 1,
          prompt_tokens_details: { cached_tokens: 1365 },
        },
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      }
      const result = convertSSEEvent('', firstChunk, 'openai', 'anthropic', ctx)

      expect(result).not.toBeNull()
      const ev = result as { event: string; data: any }
      expect(ev.event).toBe('message_start')
      expect(ev.data.message.usage).toBeDefined()
      expect(ev.data.message.usage.cache_read_input_tokens).toBe(1365)
    })

    it('AC3b: 首 chunk prompt_tokens_details 缺省 → message.usage 无 cache_read_input_tokens（透明）', () => {
      const ctx = createStreamContext()
      const firstChunk = {
        id: 'chatcmpl-xyz',
        model: 'gpt-4o',
        usage: { prompt_tokens: 100, completion_tokens: 1 },
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      }
      const result = convertSSEEvent('', firstChunk, 'openai', 'anthropic', ctx)

      expect(result).not.toBeNull()
      const ev = result as { event: string; data: any }
      expect(ev.event).toBe('message_start')
      expect(ev.data.message.usage.cache_read_input_tokens).toBeUndefined()
    })
  })
})
