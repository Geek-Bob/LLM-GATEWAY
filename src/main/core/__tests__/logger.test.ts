import { describe, it, expect, vi } from 'vitest'
import { createLogger } from '../logger'

describe('createLogger', () => {
  it('返回包含 info/warn/error/debug 方法的对象', () => {
    const logger = createLogger('test-module')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('info 方法接收消息和可选 data', () => {
    const logger = createLogger('test')
    expect(() => logger.info('test message')).not.toThrow()
    expect(() => logger.info('test message', { key: 'value' })).not.toThrow()
  })

  it('在模块名前缀中包含 moduleName', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = createLogger('my-module')
    logger.info('hello')
    expect(consoleSpy).toHaveBeenCalled()
    const call = consoleSpy.mock.calls[0]
    expect(call[0]).toContain('my-module')
    consoleSpy.mockRestore()
  })
})
