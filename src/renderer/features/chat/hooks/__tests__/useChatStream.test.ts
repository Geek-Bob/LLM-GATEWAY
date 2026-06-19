/**
 * useChatStream 注入思考参数测试
 *
 * 覆盖 Task 9 验收标准：
 * - thinkingType=disabled 时请求体不含 thinking、不含 reasoning_effort
 * - thinkingType=enabled 时请求体含 thinking:{type:'enabled'} + reasoning_effort
 * - thinkingType=adaptive 时请求体含 thinking:{type:'adaptive'} + reasoning_effort
 * - 原 model/messages/stream 组装不受 thinkingConfig 影响
 *
 * 策略：mock globalThis.fetch 拦截 apiFetch 内部的 fetch 调用，
 * 返回立即关闭的空 SSE 流（让 send 正常走完 finally），再断言传给 fetch 的 body。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatStream } from '../useChatStream'
import { setApiKey } from '@/lib/api-client'

const originalFetch = globalThis.fetch
let fetchMock: vi.Mock

/**
 * 构造立即关闭的空 SSE 流，模拟"无数据流"的 200 响应。
 * 让 send 跳过 while 循环、走完 finally，不触发任何错误分支。
 */
function mockFetchEmptyStream(): vi.Mock {
  const stream = new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  })
  globalThis.fetch = mock as unknown as typeof fetch
  return mock
}

/** 提取 send 实际传给 fetch 的请求体（JSON 字符串 → 对象）。 */
function getSentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  // useChatStream 要求 apiKey 已配置，否则 send 提前 return 不触发 fetch
  setApiKey('sk-test-key')
  fetchMock = mockFetchEmptyStream()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('useChatStream - thinkingConfig 注入', () => {
  it('thinkingType=disabled 时请求体不含 thinking 和 reasoning_effort', async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useChatStream(onUpdate))

    await act(async () => {
      await result.current.send('gpt-4', [{ role: 'user', content: 'hi' }], {
        thinkingType: 'disabled',
        reasoningEffort: 'medium',
      })
    })

    const body = getSentBody()
    expect(body.thinking).toBeUndefined()
    expect(body.reasoning_effort).toBeUndefined()
    expect(body.model).toBe('gpt-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.stream).toBe(true)
  })

  it('thinkingType=enabled 时请求体含 thinking:{type:"enabled"} 和 reasoning_effort', async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useChatStream(onUpdate))

    await act(async () => {
      await result.current.send('gpt-4', [{ role: 'user', content: 'hi' }], {
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      })
    })

    const body = getSentBody()
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
  })

  it('thinkingType=adaptive 时请求体含 thinking:{type:"adaptive"} 和 reasoning_effort', async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useChatStream(onUpdate))

    await act(async () => {
      await result.current.send('claude-4', [{ role: 'user', content: 'hi' }], {
        thinkingType: 'adaptive',
        reasoningEffort: 'max',
      })
    })

    const body = getSentBody()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.reasoning_effort).toBe('max')
  })

  it('原 model/messages/stream 组装不受 thinkingConfig 影响', async () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useChatStream(onUpdate))

    await act(async () => {
      await result.current.send('claude-4', [{ role: 'user', content: 'hello' }], {
        thinkingType: 'enabled',
        reasoningEffort: 'low',
      })
    })

    const body = getSentBody()
    expect(body.model).toBe('claude-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(body.stream).toBe(true)
  })
})
