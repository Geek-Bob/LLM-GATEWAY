// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createProxyLogService } from '../logger'
import type { LogDebugInfo } from '../../../shared/types'

/** 构造一个注入空依赖的日志服务，仅用于调用纯解析函数 */
function createService() {
  return createProxyLogService({
    createLogEntry: vi.fn(),
    updateRequestStats: vi.fn().mockResolvedValue(undefined),
    updateProviderStats: vi.fn().mockResolvedValue(undefined),
  })
}

describe('extractUsageFromSSE - cacheTokens', () => {
  it('OpenAI: extracts cached_tokens from prompt_tokens_details', () => {
    const sse = [
      'data: {"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":30}}}',
      '',
      'data: [DONE]',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'openai')
    expect(result.tokensIn).toBe(100)
    expect(result.tokensOut).toBe(50)
    expect(result.cacheTokens).toBe(30)
  })

  it('OpenAI: extracts usage from choices[0].usage (kimi/moonshot 非标准位置)', () => {
    // kimi/moonshot 流式响应把 usage 嵌在 choices[0].usage 而非顶层 data.usage，
    // 且无需 stream_options.include_usage 即在最后一个 chunk 返回
    const sse = [
      'data: {"id":"x","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}',
      '',
      'data: {"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop","usage":{"prompt_tokens":51,"completion_tokens":89,"total_tokens":140}}]}',
      '',
      'data: [DONE]',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'openai')
    expect(result.tokensIn).toBe(51)
    expect(result.tokensOut).toBe(89)
    expect(result.cacheTokens).toBe(0)
  })

  it('OpenAI: handles data: without space for cached_tokens', () => {
    const sse = [
      'data:{"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":25}}}',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'openai')
    expect(result.cacheTokens).toBe(25)
  })

  it('Anthropic: extracts cache_read_input_tokens from message_start', () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"output_tokens":0,"cache_read_input_tokens":40,"cache_creation_input_tokens":10}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":50}}',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'anthropic')
    expect(result.tokensIn).toBe(100)
    expect(result.tokensOut).toBe(50)
    expect(result.cacheTokens).toBe(40)
  })

  it('Anthropic: cache_creation_input_tokens NOT counted as cacheTokens', () => {
    // 只有 cache_creation，没有 cache_read —— cacheTokens 应为 0
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"output_tokens":0,"cache_creation_input_tokens":60}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":50}}',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'anthropic')
    expect(result.cacheTokens).toBe(0)
  })

  it('returns cacheTokens=0 when no cache fields present (OpenAI)', () => {
    const sse = [
      'data: {"usage":{"prompt_tokens":100,"completion_tokens":50}}',
      '',
      'data: [DONE]',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'openai')
    expect(result.cacheTokens).toBe(0)
  })

  it('returns cacheTokens=0 when no cache fields present (Anthropic)', () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"output_tokens":0}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":50}}',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'anthropic')
    expect(result.cacheTokens).toBe(0)
  })

  it('returns cacheTokens=0 when usage JSON is malformed (OpenAI)', () => {
    // 格式错误的 JSON 应被跳过，不影响 cacheTokens 默认值 0
    const sse = [
      'data: {not valid json}',
      ''
    ].join('\n')
    const result = createService().extractUsageFromSSE(sse, 'openai')
    expect(result.cacheTokens).toBe(0)
    expect(result.tokensIn).toBe(0)
    expect(result.tokensOut).toBe(0)
  })
})

describe('extractAndLogSSE - cacheTokens propagation', () => {
  it('propagates cacheTokens from SSE usage to tryLogEntry via createLogEntry', async () => {
    const createLogEntry = vi.fn()
    const service = createProxyLogService({
      createLogEntry,
      updateRequestStats: vi.fn().mockResolvedValue(undefined),
      updateProviderStats: vi.fn().mockResolvedValue(undefined),
    })

    const sseEvents = [
      'data: {"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":30}}}',
      '',
      'data: [DONE]',
      ''
    ].join('\n')

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseEvents))
        controller.close()
      }
    })

    await service.extractAndLogSSE(
      stream,
      { model: 'gpt-4', apiFormat: 'openai' },
      'openai'
    )

    expect(createLogEntry).toHaveBeenCalledTimes(1)
    const entry = createLogEntry.mock.calls[0][0]
    expect(entry.cacheTokens).toBe(30)
    expect(entry.tokensIn).toBe(100)
    expect(entry.tokensOut).toBe(50)
  })

  it('propagates cacheTokens to updateRequestStats and updateProviderStats', async () => {
    const createLogEntry = vi.fn()
    const updateRequestStats = vi.fn().mockResolvedValue(undefined)
    const updateProviderStats = vi.fn().mockResolvedValue(undefined)
    const service = createProxyLogService({
      createLogEntry,
      updateRequestStats,
      updateProviderStats,
    })

    const sseEvents = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"output_tokens":0,"cache_read_input_tokens":40}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":50}}',
      ''
    ].join('\n')

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseEvents))
        controller.close()
      }
    })

    await service.extractAndLogSSE(
      stream,
      { model: 'claude-3', apiFormat: 'anthropic', providerId: 1 },
      'anthropic'
    )

    // fire-and-forget 异步统计更新，等待微任务刷新
    await new Promise((resolve) => setImmediate(resolve))

    expect(updateRequestStats).toHaveBeenCalledTimes(1)
    expect(updateRequestStats.mock.calls[0][0].cacheTokens).toBe(40)
    expect(updateProviderStats).toHaveBeenCalledTimes(1)
    expect(updateProviderStats.mock.calls[0][0].cacheTokens).toBe(40)
  })
})

describe('extractAndLogSSE - debug.upstream.responseBody (SSE 事件 JSON 数组)', () => {
  /** 构造最小可用的 LogDebugInfo，仅 upstream.responseBody 待 extractAndLogSSE 填充 */
  function createDebug(): LogDebugInfo {
    return {
      client: { body: '', apiFormat: 'openai' },
      route: { providerName: '', providerType: '', baseUrl: '', modelName: '' },
      upstream: { url: '', body: '', statusCode: 0, responseBody: '' },
    }
  }

  /** 构造注入空依赖的日志服务，仅用于触发 extractAndLogSSE 写入 createLogEntry */
  function createServiceWithMock(createLogEntry: ReturnType<typeof vi.fn>) {
    return createProxyLogService({
      createLogEntry,
      updateRequestStats: vi.fn().mockResolvedValue(undefined),
      updateProviderStats: vi.fn().mockResolvedValue(undefined),
    })
  }

  /** 将字符串编码为单次推送的 ReadableStream */
  function toStream(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    })
  }

  it('OpenAI: 解析所有 data 行为 JSON 数组，保留 chunk 完整结构，无 _event', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2) // [DONE] 跳过
    expect(parsed[0]).toEqual({
      id: 'chatcmpl-1',
      choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }],
    })
    expect(parsed[0]._event).toBeUndefined() // OpenAI SSE 无 event 行
    expect(parsed[1].usage.prompt_tokens).toBe(10)
    expect(parsed[1].choices[0].finish_reason).toBe('stop')
  })

  it('Anthropic: 解析 event+data 行，每项注入 _event 保留事件类型', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg-1","usage":{"input_tokens":10,"output_tokens":0}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'claude-3', apiFormat: 'anthropic' }, 'anthropic', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]._event).toBe('message_start')
    expect(parsed[0].type).toBe('message_start')
    expect(parsed[0].message.id).toBe('msg-1')
    expect(parsed[1]._event).toBe('content_block_delta')
    expect(parsed[1].delta.text).toBe('你好')
    expect(parsed[2]._event).toBe('message_stop')
  })

  it('格式错误的 JSON 行跳过，不影响其他 chunk', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"ok","choices":[]}',
      '',
      'data: {not valid json}',
      '',
      'data: {"id":"ok2","choices":[]}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toHaveLength(2) // 中间格式错误行跳过
    expect(parsed[0].id).toBe('ok')
    expect(parsed[1].id).toBe('ok2')
  })

  it('data: 无空格前缀兼容', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = 'data:{"id":"nospace","choices":[]}\n'

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('nospace')
  })

  it('event: 无空格前缀兼容（Anthropic）', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'event:message_start',
      'data: {"type":"message_start"}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'claude-3', apiFormat: 'anthropic' }, 'anthropic', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]._event).toBe('message_start')
  })
})
