// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { initLogsDir, queryLogs, type LogQuery } from '../../../db/logs'
import { createLogStatsRepository } from '../../../db/logs-stats'
import { createLogsService } from '../logs.service'

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

/**
 * detailedStats 测试：使用内存数据库，不 mock statsRepo。
 * 验证 service 层透传 cacheTokens/cost 并完成 snake→camelCase 映射。
 */
describe('logs.service → detailedStats', () => {
  let db: Awaited<ReturnType<typeof initDatabase>>
  let service: ReturnType<typeof createLogsService>
  let statsRepo: ReturnType<typeof createLogStatsRepository>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    createTables()
    statsRepo = createLogStatsRepository(db)
    service = createLogsService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  /** 插入 provider 行以满足 provider_pricing 外键约束 */
  function insertProvider(id: number, name: string): void {
    db.prepare(
      `INSERT INTO providers (id, name, provider_type, base_url, api_key)
       VALUES (@id, @name, 'openai', 'https://x.com', 'sk-test')`
    ).run({ id, name })
  }

  /** 插入 pricing 记录（先确保 provider 存在） */
  function insertPricing(providerId: number, model: string, pic: number, piu: number, po: number): void {
    insertProvider(providerId, `p${providerId}`)
    db.prepare(
      `INSERT INTO provider_pricing (provider_id, model, price_in_cached, price_in_uncached, price_out)
       VALUES (@providerId, @model, @pic, @piu, @po)`
    ).run({ providerId, model, pic, piu, po })
  }

  it('每模型含 cacheTokens 与 cost；每时间点含 cacheTokens 与 cost', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'gpt-4',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
      durationMs: 100, statusCode: 200
    })

    const result = await service.detailedStats('24h')
    expect(result).toHaveLength(1)
    expect(result[0].providerName).toBe('p1')
    expect(result[0].models).toHaveLength(1)

    const m = result[0].models[0]
    expect(m.model).toBe('gpt-4')
    expect(m.totalRequests).toBe(1)
    expect(m.cacheTokens).toBe(400)
    expect(m.totalTokensIn).toBe(1000)
    expect(m.totalTokensOut).toBe(500)
    // cost = 400*100/1e6 + 600*300/1e6 + 500*600/1e6 = 0.52
    expect(m.cost).toBeCloseTo(0.52, 10)

    expect(m.dataPoints).toHaveLength(1)
    const dp = m.dataPoints[0]
    expect(dp.requests).toBe(1)
    expect(dp.tokensIn).toBe(1000)
    expect(dp.tokensOut).toBe(500)
    expect(dp.cacheTokens).toBe(400)
    expect(dp.cost).toBeCloseTo(0.52, 10)
  })

  it('缺单价模型 cost 为 0 但 cacheTokens 正常透传', async () => {
    insertProvider(1, 'p1')
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'claude-3-opus',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 200,
      durationMs: 100, statusCode: 200
    })

    const result = await service.detailedStats('24h')
    const m = result[0].models[0]
    expect(m.cacheTokens).toBe(200)
    expect(m.cost).toBe(0)
    expect(m.dataPoints[0].cacheTokens).toBe(200)
    expect(m.dataPoints[0].cost).toBe(0)
  })

  it('30d 跨多模型聚合：model 层累加 cacheTokens 与 cost', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)
    insertPricing(2, 'claude-3-opus', 200, 800, 2000)
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'gpt-4',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
      durationMs: 100, statusCode: 200
    })
    await statsRepo.updateProviderStats({
      providerId: 2, model: 'claude-3-opus',
      tokensIn: 2000, tokensOut: 1000, cacheTokens: 500,
      durationMs: 200, statusCode: 200
    })

    const result = await service.detailedStats('30d')
    expect(result).toHaveLength(2)

    const byName = new Map(result.map((p) => [p.providerName, p]))
    const gpt = byName.get('p1')!.models[0]
    const claude = byName.get('p2')!.models[0]
    expect(gpt.cacheTokens).toBe(400)
    expect(gpt.cost).toBeCloseTo(0.52, 10)
    expect(claude.cacheTokens).toBe(500)
    // claude: 500*200/1e6 + 1500*800/1e6 + 1000*2000/1e6 = 0.10+1.20+2.00 = 3.30
    expect(claude.cost).toBeCloseTo(3.30, 10)
  })

  it('无数据时返回空数组', async () => {
    const result = await service.detailedStats('24h')
    expect(result).toEqual([])
  })

  it('每时间点含费用三分 cacheCost/uncachedCost/outputCost；model 层透传累加', async () => {
    // gpt-4: pic=100, piu=300, po=600；tokens_in=1000, tokens_out=500, cache=400
    // uncached_tokens = 1000-400 = 600
    // cache_cost = 400*100/1e6 = 0.04
    // uncached_cost = 600*300/1e6 = 0.18
    // output_cost = 500*600/1e6 = 0.30
    insertPricing(1, 'gpt-4', 100, 300, 600)
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'gpt-4',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
      durationMs: 100, statusCode: 200
    })

    const result = await service.detailedStats('24h')
    const m = result[0].models[0]
    expect(m.cacheCost).toBeCloseTo(0.04, 10)
    expect(m.uncachedCost).toBeCloseTo(0.18, 10)
    expect(m.outputCost).toBeCloseTo(0.30, 10)

    expect(m.dataPoints).toHaveLength(1)
    const dp = m.dataPoints[0]
    expect(dp.cacheCost).toBeCloseTo(0.04, 10)
    expect(dp.uncachedCost).toBeCloseTo(0.18, 10)
    expect(dp.outputCost).toBeCloseTo(0.30, 10)
  })

  it('缺单价模型三费用都为 0', async () => {
    insertProvider(1, 'p1')
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'claude-3-opus',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 200,
      durationMs: 100, statusCode: 200
    })

    const result = await service.detailedStats('24h')
    const m = result[0].models[0]
    expect(m.cacheCost).toBe(0)
    expect(m.uncachedCost).toBe(0)
    expect(m.outputCost).toBe(0)
    expect(m.dataPoints[0].cacheCost).toBe(0)
    expect(m.dataPoints[0].uncachedCost).toBe(0)
    expect(m.dataPoints[0].outputCost).toBe(0)
  })

  it('30d 跨多模型：model 层累加 cacheCost/uncachedCost/outputCost', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)
    insertPricing(2, 'claude-3-opus', 200, 800, 2000)
    await statsRepo.updateProviderStats({
      providerId: 1, model: 'gpt-4',
      tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
      durationMs: 100, statusCode: 200
    })
    await statsRepo.updateProviderStats({
      providerId: 2, model: 'claude-3-opus',
      tokensIn: 2000, tokensOut: 1000, cacheTokens: 500,
      durationMs: 200, statusCode: 200
    })

    const result = await service.detailedStats('30d')
    const byName = new Map(result.map((p) => [p.providerName, p]))
    const gpt = byName.get('p1')!.models[0]
    const claude = byName.get('p2')!.models[0]
    // gpt-4: cache=0.04, uncached=0.18, output=0.30
    expect(gpt.cacheCost).toBeCloseTo(0.04, 10)
    expect(gpt.uncachedCost).toBeCloseTo(0.18, 10)
    expect(gpt.outputCost).toBeCloseTo(0.30, 10)
    // claude: cache=500*200/1e6=0.10, uncached=1500*800/1e6=1.20, output=1000*2000/1e6=2.00
    expect(claude.cacheCost).toBeCloseTo(0.10, 10)
    expect(claude.uncachedCost).toBeCloseTo(1.20, 10)
    expect(claude.outputCost).toBeCloseTo(2.00, 10)
  })
})
