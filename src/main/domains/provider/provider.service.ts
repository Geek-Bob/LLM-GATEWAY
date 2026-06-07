import type { Database } from '../../db/database'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'
import {
  listProviders,
  getProvider,
  getProviderByName,
  createProvider,
  updateProvider,
  deleteProvider,
  type ProviderRow,
} from '../../db/providers'
import type { ProviderEntity } from '../../shared/types'

/**
 * 创建供应商业务服务
 * 封装 providers 表的完整 CRUD 操作，负责数据库行记录与对外响应对象的转换
 */
export function createProviderService(_db: Database) {
  return {
    /** 获取所有供应商，按创建时间降序排列 */
    list: async (): Promise<ProviderResponse[]> => {
      const rows = listProviders()
      return rows.map(providerRowToResponse)
    },

    /** 根据 ID 获取单个供应商 */
    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const row = getProvider(id)
      if (!row) return undefined
      return providerRowToResponse(row)
    },

    /** 根据 name 精确匹配查询供应商（代理路由通过此方法解析模型 ID 中的前缀） */
    getByName: (name: string): ProviderEntity | undefined => {
      const row = getProviderByName(name)
      if (!row) return undefined
      return providerRowToResponse(row)
    },

    /** 创建新供应商，models 字段会自动序列化为 JSON 字符串 */
    create: async (input: CreateProviderInput): Promise<number> => {
      return createProvider(input)
    },

    /** 更新供应商信息，仅更新传入的字段 */
    update: async (id: number, input: UpdateProviderInput): Promise<void> => {
      updateProvider(id, input)
    },

    /** 根据 ID 删除供应商 */
    remove: async (id: number): Promise<void> => {
      deleteProvider(id)
    },
  }
}

/**
 * 将数据库层 snake_case ProviderRow 转换为 camelCase ProviderResponse。
 * 特别处理 models 字段：数据库存的是 JSON 字符串，此处反序列化为数组。
 */
function providerRowToResponse(row: ProviderRow): ProviderResponse {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    models: JSON.parse(row.models) as string[],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
