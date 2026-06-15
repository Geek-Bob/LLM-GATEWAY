// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z, ZodError } from 'zod'
import { wrapIpcHandler } from '../ipc-utils'

// Mock logger 用于断言系统错误时是否记录详细日志
vi.mock('../../core/logger', () => {
  const debug = vi.fn()
  const info = vi.fn()
  const warn = vi.fn()
  const error = vi.fn()
  return {
    createLogger: () => ({ debug, info, warn, error }),
    __mocks: { debug, info, warn, error },
  }
})

// 引入 mock 内的 spy
type LoggerSpies = { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
const loggerMocks = (await import('../../core/logger')) as unknown as { __mocks: LoggerSpies }

describe('wrapIpcHandler — 业务/系统错误区分', () => {
  beforeEach(() => {
    loggerMocks.__mocks.warn.mockClear()
    loggerMocks.__mocks.error.mockClear()
  })

  it('正常返回值原样透传', async () => {
    const wrapped = wrapIpcHandler(async () => ({ ok: 1 }), 'test:ok')
    const result = await wrapped()
    expect(result).toEqual({ ok: 1 })
  })

  it('ZodError 返回 Invalid input 格式', async () => {
    const schema = z.object({ name: z.string().min(1) })
    const wrapped = wrapIpcHandler(async (input: unknown) => {
      schema.parse(input)
      return { ok: true }
    }, 'test:zod')
    const result = await wrapped({ name: '' })
    expect(result).toHaveProperty('error')
    const err = (result as { error: string }).error
    expect(err).toContain('Invalid input:')
    expect(err).toContain('name')
  })

  it('业务错误（Failed to 开头）原样返回，记录 warn 日志', async () => {
    const businessError = new Error('Failed to delete agent: cannot delete builtin')
    const wrapped = wrapIpcHandler(async () => {
      throw businessError
    }, 'agents:delete')

    const result = await wrapped()
    expect(result).toEqual({ error: 'Failed to delete agent: cannot delete builtin' })
    expect(loggerMocks.__mocks.warn).toHaveBeenCalledTimes(1)
    expect(loggerMocks.__mocks.error).not.toHaveBeenCalled()
  })

  it('系统错误（非 Failed to 开头）返回通用消息，记录 error 日志含 stack', async () => {
    const sysError = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed')
    const wrapped = wrapIpcHandler(async () => {
      throw sysError
    }, 'providers:create')

    const result = await wrapped()
    expect(result).toEqual({ error: 'Failed to providers:create: internal error' })
    // 不应泄漏原始 SQLite 错误消息
    expect((result as { error: string }).error).not.toContain('SQLITE_CONSTRAINT')

    expect(loggerMocks.__mocks.error).toHaveBeenCalledTimes(1)
    const [, meta] = loggerMocks.__mocks.error.mock.calls[0]
    expect(meta.error).toBe('SQLITE_CONSTRAINT: UNIQUE constraint failed')
    expect(meta.channel).toBe('providers:create')
    expect(meta.stack).toBeDefined()
  })

  it('非 Error 异常（字符串抛出）视为系统错误', async () => {
    const wrapped = wrapIpcHandler(async () => {
      throw 'unexpected string'
    }, 'test:string')
    const result = await wrapped()
    expect(result).toEqual({ error: 'Failed to test:string: internal error' })
    expect(loggerMocks.__mocks.error).toHaveBeenCalledTimes(1)
  })

  it('ZodError 不会被误判为系统错误（即使消息不以 Failed to 开头）', async () => {
    const schema = z.object({ id: z.number() })
    const wrapped = wrapIpcHandler(async (input: unknown) => {
      schema.parse(input)
    }, 'test:zod2')
    const result = await wrapped({ id: 'abc' })
    expect((result as { error: string }).error).toMatch(/^Invalid input:/)
    expect(loggerMocks.__mocks.error).not.toHaveBeenCalled()
    expect(loggerMocks.__mocks.warn).not.toHaveBeenCalled()
  })

  it('保留原 ZodError 行为：直接 throw new ZodError 也命中 Invalid input', async () => {
    const wrapped = wrapIpcHandler(async () => {
      throw new ZodError([
        { code: 'custom', path: ['field'], message: 'bad value' },
      ])
    }, 'test:zod3')
    const result = await wrapped()
    expect((result as { error: string }).error).toBe('Invalid input: field: bad value')
  })
})
