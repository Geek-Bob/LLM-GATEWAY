// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createLogStatsRepository } from '../../../db/logs-stats'
import { createStatsService } from '../stats.service'

/**
 * Stats Service 测试：使用内存数据库，不 mock statsRepo。
 * 验证 summary 透传 cacheTokens/totalCost，以及 summaryDetailed 的 snake→camelCase 映射。
 */
describe('Stats Service', () => {
  let db: Awaited<ReturnType<typeof initDatabase>>
  let service: ReturnType<typeof createStatsService>
  let statsRepo: ReturnType<typeof createLogStatsRepository>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    createTables()
    statsRepo = createLogStatsRepository(db)
    service = createStatsService(db)
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

  describe('summary 透传 cacheTokens + totalCost', () => {
    it('summary 返回 cacheTokens 与 totalCost', async () => {
      insertPricing(1, 'gpt-4', 100, 300, 600)
      // provider 维度写入（费用走 provider 表 JOIN pricing）
      await statsRepo.updateProviderStats({
        providerId: 1, model: 'gpt-4',
        tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
        durationMs: 100, statusCode: 200
      })
      // 全局表写入（cacheTokens 透传自全局表）
      await statsRepo.updateRequestStats({
        tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
        durationMs: 100, statusCode: 200
      })

      const summary = await service.summary({ range: '24h' })
      expect(summary.totalRequests).toBe(1)
      expect(summary.cacheTokens).toBe(400)
      // cost = 400*100/1e6 + 600*300/1e6 + 500*600/1e6 = 0.04+0.18+0.30 = 0.52
      expect(summary.totalCost).toBeCloseTo(0.52, 10)
    })

    it('summary 无数据时 cacheTokens 与 totalCost 为 0', async () => {
      const summary = await service.summary({ range: '24h' })
      expect(summary.cacheTokens).toBe(0)
      expect(summary.totalCost).toBe(0)
      expect(summary.totalRequests).toBe(0)
    })
  })

  describe('summaryDetailed', () => {
    it("summaryDetailed('24h') 返回完整 RangeSummary 字段（camelCase）", async () => {
      insertPricing(1, 'gpt-4', 100, 300, 600)
      await statsRepo.updateProviderStats({
        providerId: 1, model: 'gpt-4',
        tokensIn: 1000, tokensOut: 500, cacheTokens: 400,
        durationMs: 100, statusCode: 200
      })

      const s = await service.summaryDetailed('24h')
      expect(s.totalRequests).toBe(1)
      expect(s.inputTokens).toBe(1000)
      expect(s.cacheTokens).toBe(400)
      expect(s.uncachedTokens).toBe(600)
      expect(s.outputTokens).toBe(500)
      expect(s.totalTokens).toBe(1500)
      expect(s.cacheCost).toBeCloseTo(0.04, 10)
      expect(s.uncachedCost).toBeCloseTo(0.18, 10)
      expect(s.outputCost).toBeCloseTo(0.30, 10)
      expect(s.totalCost).toBeCloseTo(0.52, 10)
    })

    it("summaryDetailed('30d') 跨多 provider+model 聚合", async () => {
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

      const s = await service.summaryDetailed('30d')
      expect(s.totalRequests).toBe(2)
      expect(s.inputTokens).toBe(3000)
      expect(s.cacheTokens).toBe(900)
      expect(s.uncachedTokens).toBe(2100)
      expect(s.outputTokens).toBe(1500)
      expect(s.totalTokens).toBe(4500)
      // gpt-4: 0.52；claude: 500*200/1e6 + 1500*800/1e6 + 1000*2000/1e6 = 0.10+1.20+2.00 = 3.30
      expect(s.totalCost).toBeCloseTo(3.82, 10)
    })

    it('summaryDetailed 无数据时所有字段为 0', async () => {
      const s = await service.summaryDetailed('24h')
      expect(s.totalRequests).toBe(0)
      expect(s.totalTokens).toBe(0)
      expect(s.inputTokens).toBe(0)
      expect(s.cacheTokens).toBe(0)
      expect(s.uncachedTokens).toBe(0)
      expect(s.outputTokens).toBe(0)
      expect(s.totalCost).toBe(0)
      expect(s.cacheCost).toBe(0)
      expect(s.uncachedCost).toBe(0)
      expect(s.outputCost).toBe(0)
    })
  })
})
