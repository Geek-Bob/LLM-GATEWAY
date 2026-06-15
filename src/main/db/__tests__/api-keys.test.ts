// @vitest-environment node
import crypto from 'crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import { createApiKeyRepository } from '../api-keys'

describe('ApiKey Repository', () => {
  let repo: ReturnType<typeof createApiKeyRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createApiKeyRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should create an API key and return plaintextKey starting with sk-', async () => {
    const result = await repo.create('Test Key')

    expect(result.plaintextKey).toMatch(/^sk-/)
    expect(result.plaintextKey.length).toBe(51)
    expect(result.key.name).toBe('Test Key')
    expect(result.key.key_prefix).toBe(result.plaintextKey.slice(0, 8))
    expect(result.key.is_active).toBe(1)
    expect(result.key.rate_limit).toBe(60)
    expect(result.key.created_at).toBeTruthy()
  })

  it('should verify a valid API key and return key info', async () => {
    const result = await repo.create('Test Key')
    const verified = await repo.verify(result.plaintextKey)

    expect(verified).not.toBeNull()
    expect(verified!.id).toBe(result.key.id)
    expect(verified!.name).toBe('Test Key')
    expect(verified!.key_prefix).toBe(result.key.key_prefix)
    expect(verified!.is_active).toBe(1)
    expect(verified!.rate_limit).toBe(60)
  })

  it('should return null for an invalid API key', async () => {
    const result = await repo.verify(
      'sk-invalid-key-that-does-not-exist-in-database'
    )
    expect(result).toBeNull()
  })

  it('should list all API keys with key_plaintext and without key_hash', async () => {
    const resultA = await repo.create('Key A')
    await repo.create('Key B')
    await repo.create('Key C')

    const keys = await repo.list()
    expect(keys).toHaveLength(3)
    // 按 created_at 降序，最新的（Key C）在前；Key A 是最先创建的，所以在末尾
    const keyA = keys.find((k) => k.name === 'Key A')!
    expect(keyA.key_plaintext).toBe(resultA.plaintextKey)
    keys.forEach((key) => {
      expect(key).not.toHaveProperty('key_hash')
      expect(key).toHaveProperty('id')
      expect(key).toHaveProperty('name')
      expect(key).toHaveProperty('key_prefix')
      expect(key).toHaveProperty('key_plaintext')
      expect(key).toHaveProperty('is_active')
      expect(key).toHaveProperty('rate_limit')
      expect(key).toHaveProperty('created_at')
    })
  })

  it('should delete an API key', async () => {
    const result = await repo.create('Key to Delete')
    expect(await repo.list()).toHaveLength(1)

    await repo.remove(result.key.id)
    expect(await repo.list()).toHaveLength(0)
  })

  it('should be verifiable after creation and return null after deletion', async () => {
    const result = await repo.create('Ephemeral Key')
    expect(await repo.verify(result.plaintextKey)).not.toBeNull()

    await repo.remove(result.key.id)
    expect(await repo.verify(result.plaintextKey)).toBeNull()
  })

  it('should accept a custom rate limit', async () => {
    const result = await repo.create('Rate Limited Key', 10)
    expect(result.key.rate_limit).toBe(10)
  })

  it('should generate unique keys on each call', async () => {
    const r1 = await repo.create('Key 1')
    const r2 = await repo.create('Key 2')

    expect(r1.plaintextKey).not.toBe(r2.plaintextKey)
    expect(r1.key.key_prefix).not.toBe(r2.key.key_prefix)
  })

  it('should handle delete of non-existent id without error', async () => {
    await expect(repo.remove(999)).resolves.not.toThrow()
  })

  describe('findPlaintextById', () => {
    it('should return null for non-existent key', async () => {
      expect(await repo.findPlaintextById(999)).toBeNull()
    })

    it('should return plaintext for a newly created key (stored as plaintext)', async () => {
      const result = await repo.create('Plaintext Test')
      const plaintext = await repo.findPlaintextById(result.key.id)
      expect(plaintext).toBe(result.plaintextKey)
    })

    it('should return null for key with empty key', async () => {
      // Insert a key with empty key to simulate legacy data
      const emptyKeyHash = crypto.createHash('sha256').update('sk-empty-key-test').digest('hex')
      getDb().prepare(`
        INSERT INTO api_keys (name, key_prefix, key_hash, key, rate_limit)
        VALUES (@name, @prefix, @hash, @encrypted, @rate)
      `).run({ name: 'Empty Key', prefix: 'sk-empty', hash: emptyKeyHash, encrypted: '', rate: 60 })

      const row = getDb().prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(emptyKeyHash) as { id: number }
      expect(row).toBeDefined()
      // 空字符串密钥视为「无明文」（legacy 数据），findPlaintextById 应返回 null
      const result = await repo.findPlaintextById(row.id)
      expect(result).toBeNull()
    })
  })

  describe('findById', () => {
    it('should return null for non-existent api key id', async () => {
      const key = await repo.findById(999)
      expect(key).toBeNull()
    })

    it('should return api key row by id', async () => {
      // Create a key using the raw SQL to simulate legacy data path
      const keyHash = crypto.createHash('sha256').update('sk-test-key').digest('hex')
      getDb().prepare(`
        INSERT INTO api_keys (name, key_prefix, key_hash, key, rate_limit)
        VALUES (@name, @prefix, @hash, @encrypted, @rate)
      `).run({ name: 'Test Key Entry', prefix: 'sk-test-', hash: keyHash, encrypted: 'sk-test-key-plaintext', rate: 30 })

      const row = getDb().prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(keyHash) as { id: number }

      const key = await repo.findById(row.id)
      expect(key).not.toBeNull()
      expect(key!.id).toBe(row.id)
      expect(key!.name).toBe('Test Key Entry')
      expect(key!.key_prefix).toBe('sk-test-')
      expect(key!.rate_limit).toBe(30)
      expect(key!.is_active).toBe(1)
      expect(key!.created_at).toBeTruthy()
    })
  })
})
