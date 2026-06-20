// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createProviderRepository } from '../providers'
import { createPricingRepository } from '../provider-pricing'
import type { ProviderInput } from '../providers'

describe('Pricing Repository', () => {
  let repo: ReturnType<typeof createPricingRepository>
  let providerRepo: ReturnType<typeof createProviderRepository>
  let providerId: number

  const sampleProviderInput: ProviderInput = {
    name: 'Test Provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-plaintext-key',
    models: ['gpt-4', 'gpt-3.5-turbo']
  }

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createPricingRepository(db)
    providerRepo = createProviderRepository(db)
    const created = await providerRepo.create(sampleProviderInput)
    providerId = created.id
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('upsert', () => {
    it('should insert a new pricing row and return it with timestamps', async () => {
      const row = await repo.upsert({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })

      expect(row.provider_id).toBe(providerId)
      expect(row.model).toBe('gpt-4')
      expect(row.price_in_cached).toBe(0.5)
      expect(row.price_in_uncached).toBe(1.5)
      expect(row.price_out).toBe(3.0)
      expect(row.created_at).toBeTruthy()
      expect(row.updated_at).toBeTruthy()
    })

    it('should update rather than insert on duplicate (provider_id, model) - idempotent', async () => {
      const first = await repo.upsert({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })

      // 等待 1.1s 确保 updated_at 时间戳变化（datetime('now') 精度到秒）
      await new Promise((resolve) => setTimeout(resolve, 1100))

      const second = await repo.upsert({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.8,
        priceInUncached: 2.0,
        priceOut: 5.0
      })

      // 全量列表只应有 1 条记录（而非 2 条）
      const all = await repo.list()
      expect(all).toHaveLength(1)

      // 价格应为最新值
      expect(second.price_in_cached).toBe(0.8)
      expect(second.price_in_uncached).toBe(2.0)
      expect(second.price_out).toBe(5.0)

      // created_at 应保持不变（INSERT...ON CONFLICT DO UPDATE 不重置 created_at）
      expect(second.created_at).toBe(first.created_at)
      // updated_at 应已更新
      expect(second.updated_at).not.toBe(first.updated_at)
    })
  })

  describe('list', () => {
    it('should return all rows ordered by provider_id then model', async () => {
      // 第二个供应商
      const secondProvider = await providerRepo.create({
        ...sampleProviderInput,
        name: 'Another Provider'
      })

      await repo.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await repo.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })
      await repo.upsert({
        providerId: secondProvider.id,
        model: 'gpt-4',
        priceInCached: 7,
        priceInUncached: 8,
        priceOut: 9
      })

      const all = await repo.list()
      expect(all).toHaveLength(3)

      // 按 provider_id, model 排序
      expect(all[0].provider_id).toBe(providerId)
      expect(all[0].model).toBe('claude-3')
      expect(all[1].provider_id).toBe(providerId)
      expect(all[1].model).toBe('gpt-4')
      expect(all[2].provider_id).toBe(secondProvider.id)
      expect(all[2].model).toBe('gpt-4')
    })

    it('should return empty array when no pricing rows exist', async () => {
      const all = await repo.list()
      expect(all).toEqual([])
    })
  })

  describe('findByProvider', () => {
    it('should return all pricing rows for a specific provider ordered by model', async () => {
      await repo.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await repo.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })

      const rows = await repo.findByProvider(providerId)
      expect(rows).toHaveLength(2)
      // 按 model 排序
      expect(rows[0].model).toBe('claude-3')
      expect(rows[1].model).toBe('gpt-4')
    })

    it('should return empty array for provider with no pricing rows', async () => {
      const rows = await repo.findByProvider(providerId)
      expect(rows).toEqual([])
    })
  })

  describe('remove', () => {
    it('should delete a single pricing row by (providerId, model)', async () => {
      await repo.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await repo.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })

      await repo.remove(providerId, 'gpt-4')

      const remaining = await repo.findByProvider(providerId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].model).toBe('claude-3')
    })

    it('should not throw when (providerId, model) does not exist', async () => {
      await expect(repo.remove(999, 'non-existent-model')).resolves.toBeUndefined()
    })
  })

  describe('removeByProvider', () => {
    it('should delete all pricing rows for a provider', async () => {
      await repo.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await repo.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })
      await repo.upsert({ providerId, model: 'gemini-pro', priceInCached: 7, priceInUncached: 8, priceOut: 9 })

      await repo.removeByProvider(providerId)

      const remaining = await repo.findByProvider(providerId)
      expect(remaining).toEqual([])
    })

    it('should not throw when provider has no pricing rows', async () => {
      await expect(repo.removeByProvider(999)).resolves.toBeUndefined()
    })
  })
})
