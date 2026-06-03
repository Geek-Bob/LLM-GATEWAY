import type { ApiKeyResponse, CreateApiKeyInput } from './apikey.types'
import { listApiKeys, createApiKey, deleteApiKey, getApiKeyById } from '../../db/api-keys'

/**
 * 创建 API Key 业务服务
 * 代理调用 db/api-keys 层的函数，不包含额外业务逻辑
 * 注意：与供应商不同，API Key 没有 update 操作——密钥创建后不可修改
 */
export function createApiKeyService() {
  return {
    /** 获取所有 API Key 列表 */
    list: async (): Promise<ApiKeyResponse[]> => {
      return listApiKeys()
    },

    /** 根据 ID 获取单个 API Key */
    getById: async (id: number) => {
      return getApiKeyById(id)
    },

    /** 创建新 API Key，rateLimit 默认为 60 次/分钟 */
    create: async (input: CreateApiKeyInput) => {
      return createApiKey(input.name, input.rateLimit ?? 60)
    },

    /** 根据 ID 删除 API Key */
    remove: async (id: number): Promise<void> => {
      deleteApiKey(id)
    }
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
