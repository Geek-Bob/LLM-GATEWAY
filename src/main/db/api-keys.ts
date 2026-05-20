import crypto from 'crypto'
import { getDb } from './connection'
import { decrypt } from '../utils/crypto'

const ENCRYPTION_SECRET =
  process.env.LLM_GATEWAY_SECRET || 'default-dev-secret'

export interface ApiKeyRow {
  id: number
  name: string
  key_prefix: string
  key_hash: string
  key_encrypted: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface ApiKeyResult {
  plaintextKey: string
  key: Omit<ApiKeyRow, 'key_hash' | 'key_encrypted'>
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
  const keyEncrypted = plaintextKey

  const stmt = db.prepare(`
    INSERT INTO api_keys (name, key_prefix, key_hash, key_encrypted, rate_limit)
    VALUES (@name, @key_prefix, @key_hash, @key_encrypted, @rate_limit)
  `)

  stmt.run({
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    key_encrypted: keyEncrypted,
    rate_limit: rateLimit
  })

  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ?'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash' | 'key_encrypted'>

  return {
    plaintextKey,
    key: row
  }
}

export function getApiKeyPlaintext(id: number): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT key_encrypted FROM api_keys WHERE id = ?'
  ).get(id) as { key_encrypted: string } | undefined
  if (!row || !row.key_encrypted) return null
  return tryDecrypt(row.key_encrypted)
}

function tryDecrypt(text: string): string {
  if (!text) return text
  if (text.split(':').length === 3 && text.length > 40) {
    try { return decrypt(text, ENCRYPTION_SECRET) } catch { /* not actually encrypted */ }
  }
  return text
}

export function verifyApiKey(plaintextKey: string): Omit<ApiKeyRow, 'key_hash'> | null {
  const db = getDb()
  const keyHash = hashKey(plaintextKey)
  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash'> | undefined
  return row || null
}

export function listApiKeys(): (Omit<ApiKeyRow, 'key_hash' | 'key_encrypted'> & { key_plaintext: string })[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, name, key_prefix, key_encrypted, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
  ).all() as ApiKeyRow[]

  return rows.map((row) => {
    const keyPlaintext = tryDecrypt(row.key_encrypted)
    const { key_hash, key_encrypted, ...rest } = row
    return { ...rest, key_plaintext: keyPlaintext }
  })
}

export function getApiKeyById(
  id: number
): Omit<ApiKeyRow, 'key_hash' | 'key_encrypted'> | undefined {
  const db = getDb()
  return db
    .prepare(
      'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE id = ?'
    )
    .get(id) as Omit<ApiKeyRow, 'key_hash' | 'key_encrypted'> | undefined
}

export function deleteApiKey(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}
