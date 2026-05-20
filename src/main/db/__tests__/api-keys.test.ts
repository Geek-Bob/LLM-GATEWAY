// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import {
  createApiKey,
  verifyApiKey,
  listApiKeys,
  deleteApiKey,
  getApiKeyPlaintext
} from '../api-keys'
import { getDb } from '../connection'

describe('API Keys CRUD', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should create an API key and return plaintextKey starting with sk-', () => {
    const result = createApiKey('Test Key')

    expect(result.plaintextKey).toMatch(/^sk-/)
    expect(result.plaintextKey.length).toBe(51)
    expect(result.key.name).toBe('Test Key')
    expect(result.key.key_prefix).toBe(result.plaintextKey.slice(0, 8))
    expect(result.key.is_active).toBe(1)
    expect(result.key.rate_limit).toBe(60)
    expect(result.key.created_at).toBeTruthy()
  })

  it('should verify a valid API key and return key info', () => {
    const result = createApiKey('Test Key')
    const verified = verifyApiKey(result.plaintextKey)

    expect(verified).not.toBeNull()
    expect(verified!.id).toBe(result.key.id)
    expect(verified!.name).toBe('Test Key')
    expect(verified!.key_prefix).toBe(result.key.key_prefix)
    expect(verified!.is_active).toBe(1)
    expect(verified!.rate_limit).toBe(60)
  })

  it('should return null for an invalid API key', () => {
    const result = verifyApiKey(
      'sk-invalid-key-that-does-not-exist-in-database'
    )
    expect(result).toBeNull()
  })

  it('should list all API keys with key_plaintext and without key_hash', () => {
    const resultA = createApiKey('Key A')
    createApiKey('Key B')
    createApiKey('Key C')

    const keys = listApiKeys()
    expect(keys).toHaveLength(3)
    expect(keys[0].key_plaintext).toBe(resultA.plaintextKey)
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

  it('should delete an API key', () => {
    const result = createApiKey('Key to Delete')
    expect(listApiKeys()).toHaveLength(1)

    deleteApiKey(result.key.id)
    expect(listApiKeys()).toHaveLength(0)
  })

  it('should be verifiable after creation and return null after deletion', () => {
    const result = createApiKey('Ephemeral Key')
    expect(verifyApiKey(result.plaintextKey)).not.toBeNull()

    deleteApiKey(result.key.id)
    expect(verifyApiKey(result.plaintextKey)).toBeNull()
  })

  it('should accept a custom rate limit', () => {
    const result = createApiKey('Rate Limited Key', 10)
    expect(result.key.rate_limit).toBe(10)
  })

  it('should generate unique keys on each call', () => {
    const r1 = createApiKey('Key 1')
    const r2 = createApiKey('Key 2')

    expect(r1.plaintextKey).not.toBe(r2.plaintextKey)
    expect(r1.key.key_prefix).not.toBe(r2.key.key_prefix)
  })

  it('should handle delete of non-existent id without error', () => {
    expect(() => deleteApiKey(999)).not.toThrow()
  })

  describe('getApiKeyPlaintext', () => {
    it('should return null for non-existent key', () => {
      expect(getApiKeyPlaintext(999)).toBeNull()
    })

    it('should return plaintext for a newly created key (stored as plaintext)', () => {
      const result = createApiKey('Plaintext Test')
      const plaintext = getApiKeyPlaintext(result.key.id)
      expect(plaintext).toBe(result.plaintextKey)
    })

    it('should return null for key with empty key_encrypted', () => {
      // Insert a key with empty key_encrypted to simulate legacy data
      const crypto = require('crypto')
      const emptyKeyHash = crypto.createHash('sha256').update('sk-empty-key-test').digest('hex')
      getDb().prepare(`
        INSERT INTO api_keys (name, key_prefix, key_hash, key_encrypted, rate_limit)
        VALUES (@name, @prefix, @hash, @encrypted, @rate)
      `).run({ name: 'Empty Key', prefix: 'sk-empty', hash: emptyKeyHash, encrypted: '', rate: 60 })

      const row = getDb().prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(emptyKeyHash) as { id: number }
      expect(row).toBeDefined()
      expect(getApiKeyPlaintext(row.id)).toBeNull()
    })
  })
})
