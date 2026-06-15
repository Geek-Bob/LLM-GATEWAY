import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
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

describe('createLogger 生产环境 debug 守卫', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    // 清理可能残留的 spies
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    vi.restoreAllMocks()
  })

  it('生产环境 (NODE_ENV=production) 时 debug 不输出到 console', () => {
    process.env.NODE_ENV = 'production'
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.debug('should be suppressed', { key: 'value' })
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('开发环境 (NODE_ENV=development) 时 debug 正常输出到 console', () => {
    process.env.NODE_ENV = 'development'
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.debug('should be emitted', { key: 'value' })
    expect(debugSpy).toHaveBeenCalled()
    const call = debugSpy.mock.calls[0]
    expect(call[0]).toContain('should be emitted')
  })

  it('生产环境时 info/warn/error 不受守卫影响', () => {
    process.env.NODE_ENV = 'production'
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.info('info msg')
    logger.warn('warn msg')
    logger.error('error msg')
    expect(infoSpy).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('生产环境时 debug 也不写入 file transport', async () => {
    process.env.NODE_ENV = 'production'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-gateway-logger-prod-'))
    const logPath = path.join(tmpDir, 'prod-debug.log')
    const logger = createLogger('test', { file: logPath })
    logger.debug('should not be written', { key: 'value' })
    await new Promise((r) => setTimeout(r, 200))
    const exists = fs.existsSync(logPath)
    // 文件可能因 truncate 或目录创建存在，但内容应为空
    if (exists) {
      const content = fs.readFileSync(logPath, 'utf-8')
      expect(content).toBe('')
    }
    try { fs.rmSync(tmpDir, { recursive: true }) } catch { /* 忽略 */ }
  })
})
