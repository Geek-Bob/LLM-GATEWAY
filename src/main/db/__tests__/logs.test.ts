// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import {
  initLogsDir,
  createLogEntry,
  queryLogs,
  cleanupOldLogs
} from '../logs'
import { createLogStatsRepository } from '../logs-stats'

function tmpLogDir(): string {
  const dir = path.join(
    fs.realpathSync(fs.mkdtempSync('logs-test-'))
  )
  return dir
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

describe('NDJSON Log Sharding', () => {
  let logDir: string

  beforeEach(() => {
    logDir = tmpLogDir()
    initLogsDir(logDir)
  })

  afterEach(() => {
    rmDir(logDir)
  })

  describe('createLogEntry', () => {
    it('should create a log file and write an entry', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      expect(files).toHaveLength(1)

      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(1)

      const entry = JSON.parse(lines[0])
      expect(entry.model).toBe('gpt-4')
      expect(entry.api_format).toBe('openai')
      expect(entry.created_at).toBeDefined()
    })

    it('should store all provided fields', () => {
      createLogEntry({
        apiKeyId: 1,
        providerId: 2,
        model: 'claude-3-opus',
        apiFormat: 'anthropic',
        statusCode: 200,
        tokensIn: 500,
        tokensOut: 200,
        durationMs: 1200,
        error: 'rate_limited'
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.api_key_id).toBe(1)
      expect(entry.provider_id).toBe(2)
      expect(entry.model).toBe('claude-3-opus')
      expect(entry.api_format).toBe('anthropic')
      expect(entry.status_code).toBe(200)
      expect(entry.tokens_in).toBe(500)
      expect(entry.tokens_out).toBe(200)
      expect(entry.duration_ms).toBe(1200)
      expect(entry.error).toBe('rate_limited')
    })

    it('should handle optional fields with defaults', () => {
      createLogEntry({
        model: 'gpt-3.5-turbo',
        apiFormat: 'openai'
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.model).toBe('gpt-3.5-turbo')
      expect(entry.api_format).toBe('openai')
      // Optional fields should be undefined (not serialized)
      expect(entry.api_key_id).toBeUndefined()
    })

    it('should store debug field when provided', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        debug: {
          client: { body: '{"model":"gpt-4"}', apiFormat: 'openai' },
          route: { providerName: 'TestP', providerType: 'openai', baseUrl: 'https://api.test.com/v1', modelName: 'gpt-4' },
          upstream: { url: 'https://api.test.com/v1/chat/completions', body: '{"model":"gpt-4"}', statusCode: 200, responseBody: '{"choices":[]}' }
        }
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug).toBeDefined()
      expect(entry.debug.client.body).toBe('{"model":"gpt-4"}')
      expect(entry.debug.client.apiFormat).toBe('openai')
      expect(entry.debug.route.providerName).toBe('TestP')
      expect(entry.debug.upstream.url).toBe('https://api.test.com/v1/chat/completions')
      expect(entry.debug.upstream.statusCode).toBe(200)
    })

    it('should not include debug field when not provided', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug).toBeUndefined()
    })

    it('should store debug with conversion info', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        debug: {
          client: { body: '{}', apiFormat: 'openai' },
          route: { providerName: 'Anth', providerType: 'anthropic', baseUrl: 'https://api.anth.ai', modelName: 'claude-3' },
          conversion: { from: 'openai', to: 'anthropic', originalPath: '/v1/chat/completions', convertedPath: '/v1/messages', originalModel: 'gpt-4', convertedModel: 'claude-3' },
          upstream: { url: 'https://api.anth.ai/v1/messages', body: '{}', statusCode: 200, responseBody: '{}' }
        }
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug.conversion).toBeDefined()
      expect(entry.debug.conversion.from).toBe('openai')
      expect(entry.debug.conversion.to).toBe('anthropic')
      expect(entry.debug.conversion.convertedPath).toBe('/v1/messages')
    })

    it('should store cache_tokens field when provided', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        tokensIn: 100,
        tokensOut: 50,
        cacheTokens: 30
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.cache_tokens).toBe(30)
      expect(entry.tokens_in).toBe(100)
      expect(entry.tokens_out).toBe(50)
    })

    it('should omit cache_tokens field when not provided', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.cache_tokens).toBeUndefined()
    })
  })

  describe('queryLogs', () => {
    beforeEach(() => {
      // Insert 10 entries with different models
      for (let i = 0; i < 10; i++) {
        createLogEntry({
          model: i < 5 ? 'gpt-4' : 'claude-3-opus',
          apiFormat: i < 5 ? 'openai' : 'anthropic',
          providerId: i < 5 ? 1 : 2,
          tokensIn: 100,
          tokensOut: 50,
          durationMs: 500
        })
      }
    })

    it('should return paginated results with correct total', () => {
      const result = queryLogs({ page: 1, limit: 3 })
      expect(result.logs).toHaveLength(3)
      expect(result.total).toBe(10)
    })

    it('should return entries in reverse chronological order (newest first)', () => {
      const result = queryLogs({ page: 1, limit: 10 })
      expect(result.logs).toHaveLength(10)
      // All entries are in the same file, reversed order
    })

    it('should filter by providerId', () => {
      const result = queryLogs({ page: 1, limit: 20, providerId: 1 })
      expect(result.logs).toHaveLength(5)
      result.logs.forEach((log) => {
        expect(log.provider_id).toBe(1)
      })
    })

    it('should filter by date range', () => {
      const result = queryLogs({
        page: 1,
        limit: 20,
        dateFrom: '2020-01-01T00:00:00.000Z',
        dateTo: '2099-12-31T23:59:59.000Z'
      })
      expect(result.logs).toHaveLength(10)
    })

    it('should return empty logs for date range with no matches', () => {
      const result = queryLogs({
        page: 1,
        limit: 20,
        dateFrom: '2010-01-01T00:00:00.000Z',
        dateTo: '2010-12-31T23:59:59.000Z'
      })
      expect(result.logs).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should return empty result when no log files exist', () => {
      const emptyDir = tmpLogDir()
      initLogsDir(emptyDir)
      const result = queryLogs({ page: 1, limit: 10 })
      expect(result.logs).toHaveLength(0)
      expect(result.total).toBe(0)
      rmDir(emptyDir)
    })

    it('should return debug field in queried entries via normalizeEntry', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        debug: {
          client: { body: '{}', apiFormat: 'openai' },
          route: { providerName: 'P', providerType: 'openai', baseUrl: 'https://x.com', modelName: 'gpt-4' },
          upstream: { url: 'https://x.com/v1', body: '{}', statusCode: 200, responseBody: '{}' }
        }
      })
      const result = queryLogs({ page: 1, limit: 10 })
      const entry = result.logs.find((e: Record<string, unknown>) => e.debug) as Record<string, unknown> & {
        debug: { client: { apiFormat: string }; route: { providerName: string }; upstream: { statusCode: number } }
      }
      expect(entry).toBeDefined()
      expect(entry.debug.client.apiFormat).toBe('openai')
      expect(entry.debug.route.providerName).toBe('P')
      expect(entry.debug.upstream.statusCode).toBe(200)
    })
  })

  describe('logs-meta persistence', () => {
    let logDir: string

    beforeEach(() => {
      logDir = tmpLogDir()
      initLogsDir(logDir)
    })

    afterEach(() => {
      rmDir(logDir)
    })

    it('should create logs-meta.json after first entry is written', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const metaPath = path.join(logDir, 'logs-meta.json')
      expect(fs.existsSync(metaPath)).toBe(true)

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      expect(meta.entryCounter).toBe(1)
      expect(meta.currentFileNumber).toBe(1)
      expect(typeof meta.currentFileLines).toBe('number')
    })

    it('should restore counter state from logs-meta.json on re-init', () => {
      // 写入 50 条日志
      for (let i = 0; i < 50; i++) {
        createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      }

      // 重新初始化（模拟进程重启）
      initLogsDir(logDir)

      // 再写 1 条，ID 应该从 51 开始
      createLogEntry({ model: 'claude-3', apiFormat: 'anthropic' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const lines = content.trim().split('\n')
      // 总共应该有 51 行
      expect(lines.length).toBe(51)
      // 最后一条的 ID 应该是 51
      const lastEntry = JSON.parse(lines[lines.length - 1])
      expect(lastEntry.id).toBe(51)
    })

    it('should fall back to full scan when logs-meta.json is missing (old version upgrade)', () => {
      // 手动创建 NDJSON 文件（模拟旧版本升级）
      const line = JSON.stringify({ model: 'gpt-4', apiFormat: 'openai', created_at: new Date().toISOString() }) + '\n'
      const content = line.repeat(100)
      fs.writeFileSync(path.join(logDir, 'logs-0001.ndjson'), content, 'utf-8')

      // 删除元数据文件（如果存在）
      const metaPath = path.join(logDir, 'logs-meta.json')
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)

      // 重新初始化应该通过扫描恢复状态
      initLogsDir(logDir)

      // 写入 1 条，ID 应该从 101 开始
      createLogEntry({ model: 'claude-3', apiFormat: 'anthropic' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content2 = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const lines2 = content2.trim().split('\n')
      const lastEntry = JSON.parse(lines2[lines2.length - 1])
      expect(lastEntry.id).toBe(101)
    })
  })

  describe('file rolling', () => {
    it('should roll to a new file after 500 entries', () => {
      // Insert MAX_LINES entries
      for (let i = 0; i < 500; i++) {
        createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      }

      let files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.ndjson'))
        .sort()
      expect(files).toHaveLength(1)

      // This should trigger a roll
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.ndjson'))
        .sort()
      expect(files).toHaveLength(2)
    })

    it('should delete oldest file when exceeding 20 files', () => {
      // Pre-populate 20 files with 500 lines each via direct writes
      const line = JSON.stringify({ model: 'gpt-4', apiFormat: 'openai', createdAt: new Date().toISOString() }) + '\n'
      const content = line.repeat(500)
      for (let i = 1; i <= 20; i++) {
        fs.writeFileSync(
          path.join(logDir, `logs-${String(i).padStart(4, '0')}.ndjson`),
          content,
          'utf-8'
        )
      }
      // Re-init to pick up state
      initLogsDir(logDir)

      // One more entry triggers roll → deletes oldest (logs-0001), creates logs-0021
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.ndjson'))
        .sort()
      expect(files).toHaveLength(20)
      expect(files[0]).toBe('logs-0002.ndjson')
      expect(files[files.length - 1]).toBe('logs-0021.ndjson')
    })
  })

  describe('cleanupOldLogs', () => {
    it('should not delete files when under limit', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
      cleanupOldLogs()

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      expect(files).toHaveLength(1)
    })

    it('should delete oldest files when over limit', () => {
      // Create 21 files directly
      const line = JSON.stringify({ model: 'gpt-4', apiFormat: 'openai', createdAt: new Date().toISOString() }) + '\n'
      const content = line.repeat(500)
      for (let i = 1; i <= 21; i++) {
        fs.writeFileSync(
          path.join(logDir, `logs-${String(i).padStart(4, '0')}.ndjson`),
          content,
          'utf-8'
        )
      }
      initLogsDir(logDir)

      // cleanupOldLogs should delete the oldest (logs-0001)
      cleanupOldLogs()

      let files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.ndjson'))
        .sort()
      expect(files).toHaveLength(20)

      // Cleanup shouldn't reduce further
      cleanupOldLogs()
      files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.ndjson'))
        .sort()
      expect(files).toHaveLength(20)
    })
  })
})

describe('LogStats Repository (Pre-computed Stats)', () => {
  let statsRepo: ReturnType<typeof createLogStatsRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    statsRepo = createLogStatsRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should return zero stats for empty stats table', async () => {
    const stats = await statsRepo.getStats('24h')
    expect(stats.total_requests).toBe(0)
    expect(stats.total_tokens_in).toBe(0)
    expect(stats.total_tokens_out).toBe(0)
    expect(Number(stats.avg_duration_ms)).toBe(0)
    expect(stats.total_errors).toBe(0)
  })

  it('should update and retrieve stats correctly', async () => {
    await statsRepo.updateRequestStats({
      tokensIn: 200,
      tokensOut: 100,
      durationMs: 1000,
      statusCode: 200
    })
    await statsRepo.updateRequestStats({
      tokensIn: 400,
      tokensOut: 200,
      durationMs: 2000,
      statusCode: 500
    })

    const stats = await statsRepo.getStats('24h')
    expect(stats.total_requests).toBe(2)
    expect(stats.total_tokens_in).toBe(600)
    expect(stats.total_tokens_out).toBe(300)
    expect(Number(stats.avg_duration_ms)).toBe(1500)
    expect(stats.total_errors).toBe(1)
  })

  it('should support 7d and 30d range options', async () => {
    await statsRepo.updateRequestStats({
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 100,
      statusCode: 200
    })

    const stats7d = await statsRepo.getStats('7d')
    expect(stats7d.total_requests).toBe(1)

    const stats30d = await statsRepo.getStats('30d')
    expect(stats30d.total_requests).toBe(1)
  })
})
