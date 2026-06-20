// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createLogStatsRepository } from '../logs-stats'

describe('LogStats Repository (Pre-computed Stats)', () => {
  let statsRepo: ReturnType<typeof createLogStatsRepository>
  let db: Awaited<ReturnType<typeof initDatabase>>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    createTables()
    statsRepo = createLogStatsRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  /** 插入一条 provider 行以满足 provider_pricing 的外键约束 */
  function insertProvider(id: number, name: string): void {
    db.prepare(
      `INSERT INTO providers (id, name, provider_type, base_url, api_key)
       VALUES (@id, @name, 'openai', 'https://x.com', 'sk-test')`
    ).run({ id, name })
  }

  /** 插入一条 pricing 记录（先确保 provider 存在） */
  function insertPricing(providerId: number, model: string, pic: number, piu: number, po: number): void {
    insertProvider(providerId, `p${providerId}`)
    db.prepare(
      `INSERT INTO provider_pricing (provider_id, model, price_in_cached, price_in_uncached, price_out)
       VALUES (@providerId, @model, @pic, @piu, @po)`
    ).run({ providerId, model, pic, piu, po })
  }

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

  // ── Task 5: cache_tokens 写入与费用 JOIN ──

  it('updateRequestStats 应累加 total_cache_tokens', async () => {
    await statsRepo.updateRequestStats({
      tokensIn: 200,
      tokensOut: 100,
      cacheTokens: 80,
      durationMs: 1000,
      statusCode: 200
    })
    await statsRepo.updateRequestStats({
      tokensIn: 400,
      tokensOut: 200,
      cacheTokens: 120,
      durationMs: 2000,
      statusCode: 500
    })

    const stats = await statsRepo.getStats('24h')
    expect(stats.total_requests).toBe(2)
    expect(stats.total_cache_tokens).toBe(200)
    expect(stats.total_tokens_in).toBe(600)
    expect(stats.total_tokens_out).toBe(300)
  })

  it('updateProviderStats 应累加 total_cache_tokens', async () => {
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 300,
      durationMs: 100,
      statusCode: 200
    })
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 500,
      tokensOut: 250,
      cacheTokens: 100,
      durationMs: 200,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    expect(detailed[0].provider_id).toBe(1)
    expect(detailed[0].model).toBe('gpt-4')
    expect(detailed[0].total_cache_tokens).toBe(400)
    expect(detailed[0].total_tokens_in).toBe(1500)
    expect(detailed[0].total_tokens_out).toBe(750)
  })

  it('getStats 应返回 totalCost（全局费用汇总，7d 也算费用）', async () => {
    // 注入 pricing：providerId=1, model=gpt-4
    // 单价：cached=100 元/百万tokens, uncached=300 元/百万tokens, out=600 元/百万tokens
    insertPricing(1, 'gpt-4', 100, 300, 600)

    // provider 维度：tokensIn=1000, cache=400, tokensOut=500
    // uncached = 1000-400 = 600
    // cost = 400*100/1e6 + 600*300/1e6 + 500*600/1e6
    //      = 0.04 + 0.18 + 0.30 = 0.52
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })
    // 全局表也写一笔（验证全局表 token 独立统计，费用走 provider 表）
    await statsRepo.updateRequestStats({
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })

    const stats24h = await statsRepo.getStats('24h')
    expect(stats24h.total_cache_tokens).toBe(400)
    expect(stats24h.total_tokens_in).toBe(1000)
    expect(Number(stats24h.total_cost)).toBeCloseTo(0.52, 10)

    const stats7d = await statsRepo.getStats('7d')
    expect(Number(stats7d.total_cost)).toBeCloseTo(0.52, 10)
  })

  it('getRangeSummary(24h) 应返回完整 token+费用字段（配置单价场景）', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })

    const summary = await statsRepo.getRangeSummary('24h')
    expect(summary.total_requests).toBe(1)
    expect(summary.input_tokens).toBe(1000)
    expect(summary.cache_tokens).toBe(400)
    expect(summary.uncached_tokens).toBe(600)
    expect(summary.output_tokens).toBe(500)
    expect(summary.total_tokens).toBe(1500)
    expect(Number(summary.cache_cost)).toBeCloseTo(0.04, 10)
    expect(Number(summary.uncached_cost)).toBeCloseTo(0.18, 10)
    expect(Number(summary.output_cost)).toBeCloseTo(0.30, 10)
    expect(Number(summary.total_cost)).toBeCloseTo(0.52, 10)
  })

  it('getRangeSummary 缺单价的模型费用为 0 但 token 正常统计', async () => {
    // 不插 pricing，模型无单价
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'claude-3-opus',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 200,
      durationMs: 100,
      statusCode: 200
    })

    const summary = await statsRepo.getRangeSummary('24h')
    expect(summary.total_requests).toBe(1)
    expect(summary.input_tokens).toBe(1000)
    expect(summary.cache_tokens).toBe(200)
    expect(summary.uncached_tokens).toBe(800)
    expect(summary.output_tokens).toBe(500)
    expect(Number(summary.total_cost)).toBe(0)
    expect(Number(summary.cache_cost)).toBe(0)
    expect(Number(summary.uncached_cost)).toBe(0)
    expect(Number(summary.output_cost)).toBe(0)
  })

  it('getRangeSummary cacheTokens > tokensIn 时 uncachedTokens clamp 到 0', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    // 异常：cacheTokens=800 > tokensIn=500
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 500,
      tokensOut: 200,
      cacheTokens: 800,
      durationMs: 100,
      statusCode: 200
    })

    const summary = await statsRepo.getRangeSummary('24h')
    expect(summary.input_tokens).toBe(500)
    expect(summary.cache_tokens).toBe(800)
    expect(summary.uncached_tokens).toBe(0)
    expect(summary.output_tokens).toBe(200)
    // cache_cost = 800*100/1e6 = 0.08
    // uncached_cost = 0*300/1e6 = 0
    // output_cost = 200*600/1e6 = 0.12
    expect(Number(summary.cache_cost)).toBeCloseTo(0.08, 10)
    expect(Number(summary.uncached_cost)).toBe(0)
    expect(Number(summary.output_cost)).toBeCloseTo(0.12, 10)
    expect(Number(summary.total_cost)).toBeCloseTo(0.20, 10)
  })

  it('getRangeSummary(30d) 跨多 provider+model 聚合', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)
    insertPricing(2, 'claude-3-opus', 200, 800, 2000)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })
    await statsRepo.updateProviderStats({
      providerId: 2,
      model: 'claude-3-opus',
      tokensIn: 2000,
      tokensOut: 1000,
      cacheTokens: 500,
      durationMs: 200,
      statusCode: 200
    })

    const summary = await statsRepo.getRangeSummary('30d')
    expect(summary.total_requests).toBe(2)
    expect(summary.input_tokens).toBe(3000)
    expect(summary.cache_tokens).toBe(900)
    expect(summary.uncached_tokens).toBe(2100)
    expect(summary.output_tokens).toBe(1500)
    expect(summary.total_tokens).toBe(4500)
    // gpt-4: 400*100/1e6 + 600*300/1e6 + 500*600/1e6 = 0.04+0.18+0.30 = 0.52
    // claude: 500*200/1e6 + 1500*800/1e6 + 1000*2000/1e6 = 0.10+1.20+2.00 = 3.30
    expect(Number(summary.total_cost)).toBeCloseTo(3.82, 10)
  })

  it('getDetailedStats 每行含 cacheTokens 与 cost（JOIN pricing）', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    expect(detailed[0].provider_id).toBe(1)
    expect(detailed[0].model).toBe('gpt-4')
    expect(detailed[0].total_cache_tokens).toBe(400)
    expect(detailed[0].total_tokens_in).toBe(1000)
    expect(detailed[0].total_tokens_out).toBe(500)
    // cost = 400*100/1e6 + 600*300/1e6 + 500*600/1e6 = 0.52
    expect(Number(detailed[0].cost)).toBeCloseTo(0.52, 10)
  })

  it('getDetailedStats 缺单价模型 cost 为 0', async () => {
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'claude-3-opus',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 200,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    expect(detailed[0].total_cache_tokens).toBe(200)
    expect(Number(detailed[0].cost)).toBe(0)
  })

  // ── Task 1: getDetailedStats 费用三分时序 ──

  it('getDetailedStats 每行含 cache_cost/uncached_cost/output_cost（配置单价正确）', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    // uncached = 1000 - 400 = 600
    // cache_cost = 400 * 100 / 1e6 = 0.04
    // uncached_cost = 600 * 300 / 1e6 = 0.18
    // output_cost = 500 * 600 / 1e6 = 0.30
    expect(Number(detailed[0].cache_cost)).toBeCloseTo(0.04, 10)
    expect(Number(detailed[0].uncached_cost)).toBeCloseTo(0.18, 10)
    expect(Number(detailed[0].output_cost)).toBeCloseTo(0.30, 10)
  })

  it('getDetailedStats cost = cache_cost + uncached_cost + output_cost', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 400,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    const cacheCost = Number(detailed[0].cache_cost)
    const uncachedCost = Number(detailed[0].uncached_cost)
    const outputCost = Number(detailed[0].output_cost)
    const cost = Number(detailed[0].cost)
    expect(cost).toBeCloseTo(cacheCost + uncachedCost + outputCost, 10)
  })

  it('getDetailedStats 缺单价模型三费用列为 0', async () => {
    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'claude-3-opus',
      tokensIn: 1000,
      tokensOut: 500,
      cacheTokens: 200,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    expect(Number(detailed[0].cache_cost)).toBe(0)
    expect(Number(detailed[0].uncached_cost)).toBe(0)
    expect(Number(detailed[0].output_cost)).toBe(0)
    expect(Number(detailed[0].cost)).toBe(0)
  })

  it('getDetailedStats cacheTokens > tokensIn 时 uncached_cost clamp 到 0', async () => {
    insertPricing(1, 'gpt-4', 100, 300, 600)

    await statsRepo.updateProviderStats({
      providerId: 1,
      model: 'gpt-4',
      tokensIn: 500,
      tokensOut: 200,
      cacheTokens: 800,
      durationMs: 100,
      statusCode: 200
    })

    const detailed = await statsRepo.getDetailedStats('24h')
    expect(detailed).toHaveLength(1)
    // cache_cost = 800 * 100 / 1e6 = 0.08
    // uncached_cost = 0 * 300 / 1e6 = 0
    // output_cost = 200 * 600 / 1e6 = 0.12
    expect(Number(detailed[0].cache_cost)).toBeCloseTo(0.08, 10)
    expect(Number(detailed[0].uncached_cost)).toBe(0)
    expect(Number(detailed[0].output_cost)).toBeCloseTo(0.12, 10)
    expect(Number(detailed[0].cost)).toBeCloseTo(0.20, 10)
  })
})
