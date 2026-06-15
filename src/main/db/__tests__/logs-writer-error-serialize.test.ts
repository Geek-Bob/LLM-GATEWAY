// @vitest-environment node
/**
 * 验证 logs-writer.ts 中的 logger.debug 调用在 catch 中传入的 metadata
 * 是字符串 error 字段（非裸 Error 实例 → 避免 JSON.stringify 后变成 {}）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

function tmpLogDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'logs-writer-error-')))
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

describe('logs-writer Error 序列化', () => {
  let logDir: string
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logDir = tmpLogDir()
    // 强制非生产环境，确保 debug 实际触发到 console
    process.env.NODE_ENV = 'development'
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    rmDir(logDir)
    consoleDebugSpy.mockRestore()
  })

  it('loadMeta 解析失败时 logger.debug 收到的 metadata.error 应为字符串（非空对象）', async () => {
    // 写入非法 JSON 触发 loadMeta 的 catch
    const metaPath = path.join(logDir, 'logs-meta.json')
    fs.writeFileSync(metaPath, '{ invalid json }', 'utf-8')

    // 重新加载模块以确保使用当前 NODE_ENV
    vi.resetModules()
    const { initLogsDir } = await import('../logs-writer')
    initLogsDir(logDir)

    // 至少有一次 debug 调用记录了 'Failed to load logs meta'
    const matched = consoleDebugSpy.mock.calls.find((args: unknown[]) =>
      typeof args[0] === 'string' && args[0].includes('Failed to load logs meta')
    )
    expect(matched).toBeDefined()
    // logger 输出格式：`[timestamp] [DEBUG] [logs-writer] message {jsonPayload}`
    const line = matched![0] as string
    // 必须包含 "error" 字段且其值为字符串（非 {}）
    // 序列化后形如 ..."error":"Unexpected token..."
    expect(line).toMatch(/"error":"[^"]+"/) // 字符串值，非空对象
    expect(line).not.toMatch(/"error":\{\}/) // 必定不是空对象
  })
})
