// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createProxyLogService } from '../logger'

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
