/**
 * ApiKey 数据访问层（Repository 模式）
 *
 * 本模块管理网关的认证密钥（区别于上游供应商 API Key）：
 * - 密钥生成：使用 crypto.randomBytes(36) 生成高熵随机密钥
 * - 密钥验证：存储 SHA-256 哈希，验证时比对哈希值，不存储明文用于查询
 * - 明文密钥仅在创建时返回一次，之后无法再获取完整明文
 * - rate_limit 字段控制每个密钥的每分钟最大请求数
 */

import crypto from 'crypto'
import type { Database } from './database'

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

/** 生成新 API 密钥 */
function generateApiKey(): { plaintextKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString('base64url')
  const plaintextKey = 'sk-' + randomPart
  const keyPrefix = plaintextKey.slice(0, KEY_PREFIX_LENGTH)
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex')
  return { plaintextKey, keyPrefix, keyHash }
}

/** 对明文密钥做 SHA-256 哈希 */
function hashKey(plaintextKey: string): string {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex')
}

/**
 * 创建 ApiKey Repository 实例
 *
 * @param db - Database 实例
 * @returns ApiKey Repository 对象
 */
export function createApiKeyRepository(db: Database) {
  return {
    /** 列出所有 API Key，按创建时间降序 */
    async list(): Promise<(Omit<ApiKeyRow, 'key_hash' | 'key'> & { key_plaintext: string })[]> {
      const rows = db.prepare(
        'SELECT id, name, key_prefix, key, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
      ).all() as unknown as ApiKeyRow[]

      return rows.map((row) => {
        const { key, ...rest } = row
        return { ...rest, key_plaintext: key }
      })
    },

    /** 按 ID 查询单个密钥的基本信息（不含敏感字段） */
    async findById(id: number): Promise<Omit<ApiKeyRow, 'key_hash' | 'key'> | null> {
      const row = db.prepare(
        'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE id = ?'
      ).get(id) as Omit<ApiKeyRow, 'key_hash' | 'key'> | undefined
      return row ?? null
    },

    /** 创建 API Key */
    async create(name: string, rateLimit: number = DEFAULT_RATE_LIMIT): Promise<ApiKeyResult> {
      const { plaintextKey, keyPrefix, keyHash } = generateApiKey()

      db.prepare(`
        INSERT INTO api_keys (name, key_prefix, key_hash, key, rate_limit)
        VALUES (@name, @key_prefix, @key_hash, @key, @rate_limit)
      `).run({
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        key: plaintextKey,
        rate_limit: rateLimit
      })

      const row = db.prepare(
        'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ?'
      ).get(keyHash) as Omit<ApiKeyRow, 'key_hash' | 'key'>

      return { plaintextKey, key: row }
    },

    /** 通过 ID 获取完整的明文密钥（代理转发用） */
    async findPlaintextById(id: number): Promise<string | null> {
      const row = db.prepare('SELECT key FROM api_keys WHERE id = ?').get(id) as { key: string } | undefined
      // 使用 || 而非 ??：空字符串视为「无明文」（历史遗留 legacy 数据），统一返回 null
      return row?.key || null
    },

    /** 验证明文密钥是否有效（哈希匹配 + is_active） */
    async verify(plaintextKey: string): Promise<Omit<ApiKeyRow, 'key_hash'> | null> {
      const keyHash = hashKey(plaintextKey)
      const row = db.prepare(
        'SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys WHERE key_hash = ? AND is_active = 1'
      ).get(keyHash) as Omit<ApiKeyRow, 'key_hash'> | undefined
      return row ?? null
    },

    /** 按 ID 删除密钥 */
    async remove(id: number): Promise<void> {
      db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
    },

    /**
     * 清空 api_keys 表全部记录
     *
     * 供「按模块清空业务数据」功能调用，删除所有本地网关认证密钥。
     * 注意：明文密钥仅在 create 时返回过，clearAll 后无法恢复，调用方需确认意图。
     * 风格与 remove(id) 一致：直接 prepare().run()，无返回值。
     */
    async clearAll(): Promise<void> {
      db.prepare('DELETE FROM api_keys').run()
    },
  }
}

export type ApiKeyRepository = ReturnType<typeof createApiKeyRepository>
