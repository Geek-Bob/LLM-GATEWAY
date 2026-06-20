// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderRepository } from '../../../db/providers'
import { createPricingService } from '../pricing.service'
import type { PricingResponse } from '../pricing.types'
import type { ProviderInput } from '../../../db/providers'

describe('createPricingService', () => {
  let service: ReturnType<typeof createPricingService>
  let providerRepo: ReturnType<typeof createProviderRepository>
  let providerId: number

  const sampleProviderInput: ProviderInput = {
    name: 'Test Provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-plaintext-key',
    models: ['gpt-4', 'claude-3']
  }

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    service = createPricingService(db)
    providerRepo = createProviderRepository(db)
    const created = await providerRepo.create(sampleProviderInput)
    providerId = created.id
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('upsert', () => {
    it('should delegate to repository and return camelCase PricingResponse', async () => {
      const result = await service.upsert({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })

      // 字段转换：snake_case → camelCase，且无 created_at/updated_at 泄漏
      expect(result).toEqual({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })
      expect(result).not.toHaveProperty('price_in_cached')
      expect(result).not.toHaveProperty('created_at')
    })

    it('should update existing row idempotently on duplicate (providerId, model)', async () => {
      await service.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      const updated = await service.upsert({
        providerId,
        model: 'gpt-4',
        priceInCached: 1.5,
        priceInUncached: 2.5,
        priceOut: 3.5
      })

      expect(updated.priceInCached).toBe(1.5)
      expect(updated.priceInUncached).toBe(2.5)
      expect(updated.priceOut).toBe(3.5)

      const all = await service.list()
      expect(all).toHaveLength(1)
    })
  })

  describe('list', () => {
    it('should return empty array when no pricing rows exist', async () => {
      const result = await service.list()
      expect(result).toEqual([])
    })

    it('should return all rows as camelCase PricingResponse', async () => {
      await service.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await service.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })

      const result = await service.list()
      expect(result).toHaveLength(2)
      result.forEach((row: PricingResponse) => {
        expect(row).not.toHaveProperty('provider_id')
        expect(row).not.toHaveProperty('price_in_cached')
        expect(typeof row.providerId).toBe('number')
        expect(typeof row.priceInCached).toBe('number')
      })
    })
  })

  describe('getByProvider', () => {
    it('should return camelCase array for the given providerId', async () => {
      await service.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await service.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })

      const result = await service.getByProvider(providerId)
      expect(result).toHaveLength(2)
      expect(result.every((r) => r.providerId === providerId)).toBe(true)
      // 按 model 排序（claude-3 在 gpt-4 之前）
      expect(result[0].model).toBe('claude-3')
      expect(result[1].model).toBe('gpt-4')
      expect(result[0]).toEqual({
        providerId,
        model: 'claude-3',
        priceInCached: 4,
        priceInUncached: 5,
        priceOut: 6
      })
    })

    it('should return empty array for provider with no pricing rows', async () => {
      const result = await service.getByProvider(providerId)
      expect(result).toEqual([])
    })

    it('should only return rows for the specified providerId', async () => {
      const secondProvider = await providerRepo.create({
        ...sampleProviderInput,
        name: 'Another Provider'
      })

      await service.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await service.upsert({
        providerId: secondProvider.id,
        model: 'gpt-4',
        priceInCached: 7,
        priceInUncached: 8,
        priceOut: 9
      })

      const result = await service.getByProvider(providerId)
      expect(result).toHaveLength(1)
      expect(result[0].providerId).toBe(providerId)
    })
  })

  describe('remove', () => {
    it('should delete a single pricing row by (providerId, model)', async () => {
      await service.upsert({ providerId, model: 'gpt-4', priceInCached: 1, priceInUncached: 2, priceOut: 3 })
      await service.upsert({ providerId, model: 'claude-3', priceInCached: 4, priceInUncached: 5, priceOut: 6 })

      await service.remove(providerId, 'gpt-4')

      const remaining = await service.getByProvider(providerId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].model).toBe('claude-3')
    })

    it('should not throw when (providerId, model) does not exist', async () => {
      await expect(service.remove(999, 'non-existent')).resolves.toBeUndefined()
    })
  })
})
