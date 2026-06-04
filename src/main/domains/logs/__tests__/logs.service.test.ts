// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { initLogsDir, queryLogs, type LogQuery } from '../../../db/logs'

function tmpLogDir(): string {
  return fs.realpathSync(fs.mkdtempSync('logs-test-'))
}

function rmDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

/**
 * 直接写入 NDJSON 文件模拟真实数据，绕过 createLogEntry 的文件轮转逻辑。
 * 每条日志包含 id、model、api_format、status_code 等字段。
 */
function writeFakeLogFile(filePath: string, startId: number, count: number): void {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const id = startId + i
    lines.push(JSON.stringify({
      id,
      model: 'gpt-4',
      api_format: 'openai',
      status_code: 200,
      tokens_in: 100,
      tokens_out: 50,
      duration_ms: 200,
      created_at: `2026-06-04T${String(Math.floor(i / 60) % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`
    }))
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8')
}

/**
 * 初始化 logs-meta.json，写入 entryCounter / currentFileNumber / currentFileLines。
 */
function writeMeta(logsDir: string, entryCounter: number, currentFileNumber: number, currentFileLines: number): void {
  fs.writeFileSync(
    path.join(logsDir, 'logs-meta.json'),
    JSON.stringify({ entryCounter, currentFileNumber, currentFileLines }),
    'utf-8'
  )
}

describe('logs.service → queryLogs 分页', () => {
  let logDir: string

  beforeEach(() => {
    logDir = tmpLogDir()
    fs.mkdirSync(logDir, { recursive: true })
  })

  afterEach(() => {
    closeDatabase()
    rmDir(logDir)
  })

  /**
   * 辅助函数：先写数据文件和 meta，再调 initLogsDir 加载。
   * 确保 entryCounter 从 meta 文件正确恢复。
   */
  function setupTestData(entries: { id: number, count: number }[], total: number, fileNum: number, lastFileLines: number) {
    let startId = 1
    for (const { id, count } of entries) {
      writeFakeLogFile(
        path.join(logDir, `logs-${String(id).padStart(4, '0')}.ndjson`),
        startId,
        count
      )
      startId += count
    }
    writeMeta(logDir, total, fileNum, lastFileLines)
    initLogsDir(logDir)
  }

  it('page 1 返回最新 10 条', () => {
    // 非最后文件必须满 MAX_LINES（500），这是生产环境不变量
    setupTestData(
      [{ id: 1, count: 500 }, { id: 2, count: 500 }, { id: 3, count: 5 }],
      1005, 3, 5
    )

    const result = queryLogs({ page: 1, limit: 10 } as LogQuery)
    expect(result.total).toBe(1005)
    expect(result.logs).toHaveLength(10)
    // 最新在前：id 1005~996
    expect(result.logs[0].id).toBe(1005)
    expect(result.logs[9].id).toBe(996)
  })

  it('最后一页不满页', () => {
    // 1005 条，每页 10 条 → 101 页，最后一页 5 条
    setupTestData(
      [{ id: 1, count: 500 }, { id: 2, count: 500 }, { id: 3, count: 5 }],
      1005, 3, 5
    )

    const result = queryLogs({ page: 101, limit: 10 } as LogQuery)
    expect(result.total).toBe(1005)
    expect(result.logs).toHaveLength(5)
    expect(result.logs[0].id).toBe(5)
    expect(result.logs[4].id).toBe(1)
  })

  it('跨文件分页：page 50 横跨 file 3 和 file 2', () => {
    setupTestData(
      [{ id: 1, count: 500 }, { id: 2, count: 500 }, { id: 3, count: 5 }],
      1005, 3, 5
    )

    // page 50: skip=490, file3 有 5 条 → remaining=485, file2 有 500 条 → offsetInFile=485
    // offsetFromEnd=485 → id = 500-485 = 15 from start of file2 = id 515
    const result = queryLogs({ page: 50, limit: 10 } as LogQuery)
    expect(result.total).toBe(1005)
    expect(result.logs).toHaveLength(10)
    expect(result.logs[0].id).toBe(515)
    expect(result.logs[9].id).toBe(506)
  })

  it('page 超出范围返回空数组', () => {
    setupTestData([{ id: 1, count: 500 }], 500, 1, 500)

    const result = queryLogs({ page: 999, limit: 10 } as LogQuery)
    expect(result.total).toBe(500)
    expect(result.logs).toHaveLength(0)
  })

  it('大量数据分页：10000 条分 20 文件，page 500 正确', () => {
    // 每文件 500 条（满）
    const entries = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, count: 500 }))
    setupTestData(entries, 10000, 20, 500)

    // page 500: skip=4990, 取 id 5010~5001
    const result = queryLogs({ page: 500, limit: 10 } as LogQuery)
    expect(result.total).toBe(10000)
    expect(result.logs).toHaveLength(10)
    expect(result.logs[0].id).toBe(5010)
    expect(result.logs[9].id).toBe(5001)
  })

  it('模拟真实迁移场景：5615 条分 12 文件，page 500', () => {
    // 11 个满文件（500 条）+ 1 个 115 条的文件
    const entries = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, count: 500 }))
    entries.push({ id: 12, count: 115 })
    setupTestData(entries, 5615, 12, 115)

    // page 500: skip=4990
    // 从最新文件往前：file12=115, file11=500, file10=500, file9=500, file8=500, file7=500, file6=500
    // remaining = 4990-115-500*6 = 1875
    // file5=500, remaining=1375; file4=500, remaining=875; file3=500, remaining=375
    // file2=500, 375<500 → file2 (index 1), offsetInFile=375
    const result = queryLogs({ page: 500, limit: 10 } as LogQuery)
    expect(result.total).toBe(5615)
    expect(result.logs).toHaveLength(10)
    // file2 有 id 501~1000, offsetFromEnd=375 → id = 1000-375 = 625
    expect(result.logs[0].id).toBe(625)
    expect(result.logs[9].id).toBe(616)
  })
})
