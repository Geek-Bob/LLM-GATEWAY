import crypto from 'crypto'
import { getDb } from './connection'

export interface ApiKeyRow {
  id: number
  name: string
  key_prefix: string
  key_hash: string
  key: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface ApiKeyResult {
  plaintextKey: string
  key: Omit<ApiKeyRow, 'key_hash' | 'key'>
}

function generateApiKey(): { plaintextKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(36).toString('base64url')
  const plaintextKey = 'sk-' + randomPart
  const keyPrefix = plaintextKey.slice(0, 8)
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex')
  return { plaintextKey, keyPrefix, keyHash }
}

function hashKey(plaintextKey: string): string {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex')
}

export function createApiKey(name: string, rateLimit: number = 60): ApiKeyResult {
  const db = getDb()
  const { plaintextKey, keyPrefix, keyHash } = generateApiKey()

  const stmt = db.prepare(`
    INSERT INTO api_keys (name, key_prefix, key_hash, key, rate_limit)
    VALUES (@name, @key_prefix, @key_hash, @key, @rate_limit)
  `)

  stmt.run({
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    key: plaintextKey,
    rate_limit: rateLimit
  })

  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ?'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash' | 'key'>

  return {
    plaintextKey,
    key: row
  }
}

export function getApiKeyPlaintext(id: number): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT key FROM api_keys WHERE id = ?'
  ).get(id) as { key: string } | undefined
  if (!row || !row.key) return null
  return row.key
}

export function verifyApiKey(plaintextKey: string): Omit<ApiKeyRow, 'key_hash'> | null {
  const db = getDb()
  const keyHash = hashKey(plaintextKey)
  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash'> | undefined
  return row || null
}

export function listApiKeys(): (Omit<ApiKeyRow, 'key_hash' | 'key'> & { key_plaintext: string })[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, name, key_prefix, key, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
  ).all() as unknown as ApiKeyRow[]

  return rows.map((row) => {
    const { key_hash, key, ...rest } = row
    return { ...rest, key_plaintext: key }
  })
}

export function getApiKeyById(
  id: number
): Omit<ApiKeyRow, 'key_hash' | 'key'> | undefined {
  const db = getDb()
  return db
    .prepare(
      'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE id = ?'
    )
    .get(id) as Omit<ApiKeyRow, 'key_hash' | 'key'> | undefined
}

export function deleteApiKey(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}
