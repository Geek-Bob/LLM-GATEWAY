import { describe, it, expect, afterEach, vi } from 'vitest'
import { createLogger } from '../logger'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

describe('createLogger with file transport', () => {
  const tmpDir = path.join(os.tmpdir(), 'llm-gateway-logger-test')

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }) } catch { /* 目录不存在时忽略 */ }
  })

  it('should write log messages to specified file', async () => {
    const logPath = path.join(tmpDir, 'test.log')
    const log = createLogger('test-logger', { file: logPath })

    log.info('test message', { key: 'value' })

    // 等待异步写入完成
    await new Promise(resolve => setTimeout(resolve, 200))

    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('[test-logger]')
    expect(content).toContain('test message')
    expect(content).toContain('"key":"value"')
  })

  it('should sanitize authorization header in file transport', async () => {
    const logPath = path.join(tmpDir, 'sanitize.log')
    const log = createLogger('test', { file: logPath })

    log.info('request', { headers: { authorization: 'Bearer sk-secret-key-12345' } })

    await new Promise(resolve => setTimeout(resolve, 200))

    const content = fs.readFileSync(logPath, 'utf-8')
    // 应脱敏为后4位
    expect(content).not.toContain('sk-secret-key-12345')
    expect(content).toContain('***2345')
  })

  it('should not affect console output when file transport is enabled', () => {
    const logPath = path.join(tmpDir, 'console.log')
    const log = createLogger('test', { file: logPath })
    expect(() => log.info('console message')).not.toThrow()
    expect(() => log.error('error message')).not.toThrow()
  })
})
