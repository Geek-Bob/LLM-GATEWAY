// @vitest-environment node
/**
 * Task 2: 统计表 clearAll + resetLogs 运行数据清空测试。
 *
 * 覆盖：
 * - logStatsRepo.clearAll() 清空 request_stats + request_stats_provider 两张表
 * - resetLogs() 删除所有 logs-XXXX.ndjson + logs-meta.json
 * - resetLogs() 重置模块计数器（entryCounter / currentFileLines）归零
 * - resetLogs() 后 createLogEntry 重建 logs-0001.ndjson，从 1 开始计数
 * - resetLogs() 在 logsDir 未初始化时抛 'Logs directory not initialized'（与 createLogEntry 一致）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createLogStatsRepository } from '../logs-stats'

function tmpLogDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clear-all-op-')))
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

describe('运行数据清空：logStatsRepo.clearAll + resetLogs', () => {
  describe('logStatsRepo.clearAll()', () => {
    let statsRepo: ReturnType<typeof createLogStatsRepository>

    beforeEach(async () => {
      const db = await initDatabase(':memory:')
      createTables()
      statsRepo = createLogStatsRepository(db)
    })

    afterEach(() => {
      closeDatabase()
    })

    it('清空后 request_stats 和 request_stats_provider 行数均为 0', async () => {
      // 预置数据：向两张表各写入若干行
      await statsRepo.updateRequestStats({
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 500,
        statusCode: 200
      })
      await statsRepo.updateProviderStats({
        providerId: 1,
        model: 'gpt-4',
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 500,
        statusCode: 200
      })

      const db = (await import('../connection')).getDb()
      const beforeReq = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats')
        .get() as { cnt: number }
      const beforeProv = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats_provider')
        .get() as { cnt: number }
      expect(beforeReq.cnt).toBeGreaterThan(0)
      expect(beforeProv.cnt).toBeGreaterThan(0)

      await statsRepo.clearAll()

      const afterReq = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats')
        .get() as { cnt: number }
      const afterProv = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats_provider')
        .get() as { cnt: number }
      expect(afterReq.cnt).toBe(0)
      expect(afterProv.cnt).toBe(0)
    })

    it('清空空表不报错（幂等）', async () => {
      await expect(statsRepo.clearAll()).resolves.toBeUndefined()

      const db = (await import('../connection')).getDb()
      const reqCnt = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats')
        .get() as { cnt: number }
      const provCnt = db!
        .prepare('SELECT COUNT(*) as cnt FROM request_stats_provider')
        .get() as { cnt: number }
      expect(reqCnt.cnt).toBe(0)
      expect(provCnt.cnt).toBe(0)
    })
  })

  describe('resetLogs() — 文件清空 + 计数器重置', () => {
    let logDir: string

    beforeEach(() => {
      logDir = tmpLogDir()
    })

    afterEach(() => {
      rmDir(logDir)
      vi.resetModules()
    })

    it('删除所有 logs-XXXX.ndjson 文件和 logs-meta.json，计数器归零', async () => {
      const { initLogsDir, createLogEntry, resetLogs, getEntryCounter, getCurrentFileLines } =
        await import('../logs-writer')
      initLogsDir(logDir)

      // 写入几条日志产生 logs-0001.ndjson + meta
      for (let i = 0; i < 5; i++) {
        createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      }
      const filesBefore = fs.readdirSync(logDir)
      expect(filesBefore.filter((f) => /^logs-\d{4}\.ndjson$/.test(f))).toHaveLength(1)
      expect(fs.existsSync(path.join(logDir, 'logs-meta.json'))).toBe(true)
      expect(getEntryCounter()).toBe(5)
      expect(getCurrentFileLines()).toBe(5)

      resetLogs()

      const filesAfter = fs.readdirSync(logDir)
      expect(filesAfter.filter((f) => /^logs-\d{4}\.ndjson$/.test(f))).toHaveLength(0)
      expect(fs.existsSync(path.join(logDir, 'logs-meta.json'))).toBe(false)
      expect(getEntryCounter()).toBe(0)
      expect(getCurrentFileLines()).toBe(0)
    })

    it('清空后调用 createLogEntry 重建 logs-0001.ndjson，计数器从 1 开始', async () => {
      const { initLogsDir, createLogEntry, resetLogs, getEntryCounter } =
        await import('../logs-writer')
      initLogsDir(logDir)

      for (let i = 0; i < 3; i++) {
        createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      }
      expect(getEntryCounter()).toBe(3)

      resetLogs()

      // 清空后重新写入，应自动创建 logs-0001.ndjson 并从 id=1 开始
      createLogEntry({ model: 'claude-3', apiFormat: 'anthropic' })

      const files = fs.readdirSync(logDir).filter((f) => /^logs-\d{4}\.ndjson$/.test(f))
      expect(files).toEqual(['logs-0001.ndjson'])

      const content = fs.readFileSync(path.join(logDir, 'logs-0001.ndjson'), 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0])
      expect(entry.id).toBe(1)
      expect(entry.model).toBe('claude-3')
      expect(getEntryCounter()).toBe(1)
    })

    it('logsDir 未初始化时抛 Logs directory not initialized（与 createLogEntry 一致）', async () => {
      // 模块刚加载状态：logsDir 为 null（不调用 initLogsDir）
      const { resetLogs } = await import('../logs-writer')
      expect(() => resetLogs()).toThrow('Logs directory not initialized')
    })

    it('多文件场景：删除所有 logs-XXXX.ndjson（不限单文件）', async () => {
      const { initLogsDir, createLogEntry, resetLogs } = await import('../logs-writer')
      initLogsDir(logDir)

      // 直接预置第二个文件，模拟轮转后的多文件状态
      fs.writeFileSync(
        path.join(logDir, 'logs-0002.ndjson'),
        JSON.stringify({ id: 501, model: 'gpt-4' }) + '\n',
        'utf-8'
      )
      // 写入主日志
      for (let i = 0; i < 5; i++) {
        createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      }
      const filesBefore = fs.readdirSync(logDir).filter((f) => /^logs-\d{4}\.ndjson$/.test(f))
      expect(filesBefore.length).toBeGreaterThanOrEqual(2)

      resetLogs()

      const filesAfter = fs.readdirSync(logDir).filter((f) => /^logs-\d{4}\.ndjson$/.test(f))
      expect(filesAfter).toHaveLength(0)
    })
  })
})
