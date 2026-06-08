/**
 * API Key 业务服务
 *
 * 封装 api_keys 表的 CRUD 操作，负责密钥生成、哈希存储和对外响应转换。
 * 数据访问委托给 db/api-keys.ts，service 层只做响应格式转换。
 * 注意：与供应商不同，API Key 没有 update 操作——密钥创建后不可修改。
 */

import type { Database } from '../../db/database'
import type { ApiKeyResponse, CreateApiKeyInput } from './apikey.types'
import {
  listApiKeys,
  getApiKeyById,
  createApiKey,
  deleteApiKey,
  type ApiKeyRow,
} from '../../db/api-keys'

/**
 * 创建 API Key 业务服务
 * @param db - 注入的数据库实例
 */
export function createApiKeyService(db: Database) {
  return {
    /** 获取所有 API Key 列表，按创建时间降序 */
    list: async (): Promise<ApiKeyResponse[]> => {
      const rows = listApiKeys(db)
      return rows.map(apiKeyRowToResponse)
    },

    /** 根据 ID 获取单个 API Key（不含敏感字段） */
    getById: async (id: number) => {
      return getApiKeyById(db, id)
    },

    /** 创建新 API Key，rateLimit 默认为 60 次/分钟 */
    create: async (input: CreateApiKeyInput) => {
      const rateLimit = input.rateLimit ?? 60
      const result = createApiKey(db, input.name, rateLimit)
      return {
        plaintextKey: result.plaintextKey,
        key: result.key,
      }
    },

    /** 根据 ID 删除 API Key */
    remove: async (id: number): Promise<void> => {
      deleteApiKey(db, id)
    }
  }
}

/** 将数据库层 snake_case ApiKeyRow 转换为 camelCase ApiKeyResponse */
function apiKeyRowToResponse(row: Omit<ApiKeyRow, 'key_hash' | 'key'> & { key_plaintext: string }): ApiKeyResponse {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyPlaintext: row.key_plaintext,
    isActive: row.is_active,
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
