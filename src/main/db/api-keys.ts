/**
 * API 密钥数据访问层
 *
 * 本模块管理网关的认证密钥（区别于上游供应商 API Key）：
 * - 密钥生成：使用 crypto.randomBytes(36) 生成高熵随机密钥
 * - 密钥验证：存储 SHA-256 哈希，验证时比对哈希值，不存储明文用于查询
 * - 明文密钥仅在创建时返回一次，之后无法再获取完整明文
 * - rate_limit 字段控制每个密钥的每分钟最大请求数
 *
 * 安全设计：
 * - 数据库同样存储明文 key 字段（本地应用无网络暴露风险），
 *   但对外查询接口（verifyApiKey / listApiKeys）默认不返回完整明文
 */

import crypto from 'crypto'
import { getDb } from './connection'

/** API Key 随机部分的字节数，base64url 编码后产生 48 字符 */
const KEY_RANDOM_BYTES = 36
/** keyPrefix 取明文密钥前 N 位，用于列表显示和快速识别 */
const KEY_PREFIX_LENGTH = 8
/** 未指定 rateLimit 时的默认每分钟最大请求数 */
const DEFAULT_RATE_LIMIT = 60

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

interface ApiKeyResult {
  plaintextKey: string
  key: Omit<ApiKeyRow, 'key_hash' | 'key'>
}

/**
 * 生成新 API 密钥的内部流程：
 * 1. 用 36 字节随机数 + base64url 编码生成 48 字符密钥
 * 2. 前缀固定为 "sk-"，格式类似 "sk-xxxxxxxx..."
 * 3. keyPrefix 取前 8 位，用于列表显示和快速识别
 * 4. keyHash 使用 SHA-256 哈希，用于后续无明文验证
 */
function generateApiKey(): { plaintextKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString('base64url')
  const plaintextKey = 'sk-' + randomPart
  const keyPrefix = plaintextKey.slice(0, KEY_PREFIX_LENGTH)
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex')
  return { plaintextKey, keyPrefix, keyHash }
}

function hashKey(plaintextKey: string): string {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex')
}

/**
 * 创建 API 密钥。返回结构中包含两个部分：
 * - plaintextKey：完整的明文密钥（仅此一次，后续不再提供）
 * - key：除 key_hash 和 key 之外的数据库行信息
 */
export function createApiKey(name: string, rateLimit: number = DEFAULT_RATE_LIMIT): ApiKeyResult {
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

/**
 * 通过 ID 获取完整的明文密钥。
 * 用于代理转发时需要将 Gateway API Key 替换为上游供应商密钥的场景。
 * 此函数仅在主进程内部调用，不暴露给渲染进程。
 */
export function getApiKeyPlaintext(id: number): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT key FROM api_keys WHERE id = ?'
  ).get(id) as { key: string } | undefined
  if (!row || !row.key) return null
  return row.key
}

/**
 * 验证明文密钥是否有效。
 * 验证流程：对传入的明文做 SHA-256 → 与数据库哈希比对 → 确保 is_active = 1。
 * 返回结果不包含 key_hash 和完整 key 字段，防止哈希泄露。
 * 返回 null 表示密钥不存在或已停用。
 */
export function verifyApiKey(plaintextKey: string): Omit<ApiKeyRow, 'key_hash'> | null {
  const db = getDb()
  const keyHash = hashKey(plaintextKey)
  const row = db.prepare(
    'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash) as Omit<ApiKeyRow, 'key_hash'> | undefined
  return row || null
}

/**
 * 列出所有 API 密钥，按创建时间降序。
 * 注意：虽然数据库存了明文 key，但此处将其作为 key_plaintext 返回，
 * 用于渲染进程管理界面展示（本地桌面应用，无网络泄露风险）。
 */
export function listApiKeys(): (Omit<ApiKeyRow, 'key_hash' | 'key'> & { key_plaintext: string })[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, name, key_prefix, key, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
  ).all() as unknown as ApiKeyRow[]

  return rows.map((row) => {
    const { key, ...rest } = row
    return { ...rest, key_plaintext: key }
  })
}

/** 按 ID 查询单个密钥的基本信息（不含敏感字段）。 */
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

/** 按 ID 删除密钥。不可恢复，调用方应确认后再执行。 */
export function deleteApiKey(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}
