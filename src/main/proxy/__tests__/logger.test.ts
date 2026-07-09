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

describe('extractAndLogSSE - debug.upstream.responseBody (SSE 重组为非流式 JSON)', () => {
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

  it('OpenAI: 重组为 chat.completion 对象，拼接 content/finish_reason/usage', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"你好"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"，我是 Claude"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18,"prompt_tokens_details":{"cached_tokens":3}}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '你好，我是 Claude' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, prompt_tokens_details: { cached_tokens: 3 } },
    })
  })

  it('Anthropic: 重组为 message 对象，拼接 content/stop_reason/usage', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg-1","type":"message","role":"assistant","model":"claude-3","usage":{"input_tokens":10,"output_tokens":0,"cache_read_input_tokens":4}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"，我是 Claude"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'claude-3', apiFormat: 'anthropic' }, 'anthropic', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toEqual({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      model: 'claude-3',
      content: [{ type: 'text', text: '你好，我是 Claude' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 8, cache_read_input_tokens: 4 },
    })
  })

  it('格式错误的 JSON 行跳过，重组后 content 仍正确', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"ok","model":"gpt-4","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}',
      '',
      'data: {not valid json}',
      '',
      'data: {"id":"ok","model":"gpt-4","choices":[{"index":0,"delta":{"content":"世界"},"finish_reason":"stop"}]}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed.choices[0].message.content).toBe('你好世界')
    expect(parsed.choices[0].finish_reason).toBe('stop')
    expect(parsed.id).toBe('ok')
  })

  it('data: 无空格前缀兼容', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = 'data:{"id":"nospace","model":"gpt-4","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}\n'

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'gpt-4', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed.choices[0].message.content).toBe('hi')
    expect(parsed.id).toBe('nospace')
  })

  it('event: 无空格前缀兼容（Anthropic）', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'event:message_start',
      'data: {"type":"message_start","message":{"id":"msg-x","type":"message","role":"assistant","model":"claude-3","usage":{"input_tokens":5,"output_tokens":0}}}',
      '',
      'event:content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
      '',
      'event:message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'claude-3', apiFormat: 'anthropic' }, 'anthropic', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed.id).toBe('msg-x')
    expect(parsed.content[0].text).toBe('hi')
    expect(parsed.stop_reason).toBe('end_turn')
  })

  it('OpenAI: kimi 非标准 usage 位置（choices[0].usage）+ system_fingerprint + 嵌套 details 完整保留', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","created":1783597165,"model":"kimi-k2.7-code","system_fingerprint":"fpv0_4303a3bb","choices":[{"index":0,"delta":{"role":"assistant","content":"你好"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","created":1783597165,"model":"kimi-k2.7-code","system_fingerprint":"fpv0_4303a3bb","choices":[{"index":0,"delta":{},"finish_reason":"stop","usage":{"prompt_tokens":21,"completion_tokens":60,"total_tokens":81,"cached_tokens":21,"completion_tokens_details":{"reasoning_tokens":26},"prompt_tokens_details":{"cached_tokens":21}}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'kimi-k2.7-code', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed).toEqual({
      id: 'chatcmpl-x',
      object: 'chat.completion',
      created: 1783597165,
      model: 'kimi-k2.7-code',
      system_fingerprint: 'fpv0_4303a3bb',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '你好' },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 21,
        completion_tokens: 60,
        total_tokens: 81,
        cached_tokens: 21,
        completion_tokens_details: { reasoning_tokens: 26 },
        prompt_tokens_details: { cached_tokens: 21 },
      },
    })
  })

  it('OpenAI: delta.reasoning_content 拼接到 message.reasoning_content，与 content 分离', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'data: {"id":"r","model":"m","choices":[{"index":0,"delta":{"reasoning_content":"思考"},"finish_reason":null}]}',
      '',
      'data: {"id":"r","model":"m","choices":[{"index":0,"delta":{"reasoning_content":"过程"},"finish_reason":null}]}',
      '',
      'data: {"id":"r","model":"m","choices":[{"index":0,"delta":{"content":"答案"},"finish_reason":"stop"}]}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'm', apiFormat: 'openai' }, 'openai', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed.choices[0].message.content).toBe('答案')
    expect(parsed.choices[0].message.reasoning_content).toBe('思考过程')
  })

  it('Anthropic: message_delta.usage 所有字段完整保留，input_tokens 取 message_start 非零值', async () => {
    const createLogEntry = vi.fn()
    const service = createServiceWithMock(createLogEntry)

    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg-1","type":"message","role":"assistant","model":"claude-3","usage":{"input_tokens":22,"cache_creation_input_tokens":0,"cache_read_input_tokens":22,"output_tokens":0}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":22,"output_tokens":44,"prompt_tokens":22,"completion_tokens":44,"total_tokens":66,"cached_tokens":22}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const debug = createDebug()
    await service.extractAndLogSSE(toStream(sse), { model: 'claude-3', apiFormat: 'anthropic' }, 'anthropic', debug)

    const entry = createLogEntry.mock.calls[0][0]
    const parsed = JSON.parse(entry.debug.upstream.responseBody)
    expect(parsed.usage).toEqual({
      input_tokens: 22, // message_start 的（delta=0 不覆盖）
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 22,
      output_tokens: 44, // message_delta 的（最终值）
      prompt_tokens: 22, // message_delta 补充
      completion_tokens: 44,
      total_tokens: 66,
      cached_tokens: 22,
    })
  })
})
