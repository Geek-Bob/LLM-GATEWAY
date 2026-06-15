// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createApiKeyService } from '../apikey.service'

describe('ApiKey Service', () => {
  let service: ReturnType<typeof createApiKeyService>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    service = createApiKeyService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('list', () => {
    it('should return empty array when no keys exist', async () => {
      const keys = await service.list()
      expect(keys).toEqual([])
    })

    it('should return camelCase ApiKeyResponse array', async () => {
      await service.create({ name: 'First' })
      await service.create({ name: 'Second' })
      const keys = await service.list()
      expect(keys).toHaveLength(2)
      for (const k of keys) {
        expect(k).toHaveProperty('id')
        expect(k).toHaveProperty('name')
        expect(k).toHaveProperty('keyPrefix')
        expect(k).toHaveProperty('keyPlaintext')
        expect(k).toHaveProperty('isActive')
        expect(k).toHaveProperty('rateLimit')
        expect(k).toHaveProperty('createdAt')
        // 禁止泄漏敏感字段
        expect(k).not.toHaveProperty('key_hash')
        expect(k).not.toHaveProperty('keyPrefix_hash')
      }
    })

    it('should call apiKeyRowToResponse and include keyPlaintext from list path', async () => {
      const { plaintextKey } = await service.create({ name: 'Test' })
      const keys = await service.list()
      // list 走 repo.list()，该路径 SELECT 包含 key 并映射为 key_plaintext → keyPlaintext
      const target = keys.find((k) => k.name === 'Test')!
      expect(target.keyPlaintext).toBe(plaintextKey)
    })
  })

  describe('getById', () => {
    it('should return undefined for non-existent id', async () => {
      const result = await service.getById(99999)
      expect(result).toBeUndefined()
    })

    it('should return camelCase ApiKeyResponse for existing id', async () => {
      const created = await service.create({ name: 'Lookup', rateLimit: 120 })
      const result = await service.getById(created.key.id)
      expect(result).toBeDefined()
      expect(result!.id).toBe(created.key.id)
      expect(result!.name).toBe('Lookup')
      expect(result!.keyPrefix).toBe(created.plaintextKey.slice(0, 8))
      expect(result!.isActive).toBe(1)
      expect(result!.rateLimit).toBe(120)
      expect(result!.createdAt).toBeTruthy()
    })

    it('should return keyPlaintext as empty string when row has no key_plaintext (getById path)', async () => {
      const created = await service.create({ name: 'Lookup2' })
      const result = await service.getById(created.key.id)
      // getById 不查询 key 列（仅返回基础字段），service 用 '' 兜底，保持响应结构完整
      expect(result!.keyPlaintext).toBe('')
    })
  })

  describe('create', () => {
    it('should return plaintextKey and key info', async () => {
      const result = await service.create({ name: 'Brand New' })
      expect(result.plaintextKey).toMatch(/^sk-/)
      expect(result.key.id).toBeDefined()
      expect(result.key.name).toBe('Brand New')
      // service.create 返回的 key 仍是 db 层 row 形态（snake_case），rate_limit 默认 60
      expect(result.key.rate_limit).toBe(60)
    })

    it('should accept custom rateLimit', async () => {
      const result = await service.create({ name: 'Custom', rateLimit: 30 })
      expect(result.key.rate_limit).toBe(30)
    })
  })

  describe('remove', () => {
    it('should delete the key by id', async () => {
      const created = await service.create({ name: 'ToDelete' })
      await service.remove(created.key.id)
      const found = await service.getById(created.key.id)
      expect(found).toBeUndefined()
    })

    it('should not throw for non-existent id', async () => {
      await expect(service.remove(99999)).resolves.toBeUndefined()
    })
  })
})
