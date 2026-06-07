import type { Database } from '../../db/database'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'
import {
  listProviders,
  getProvider,
  getProviderByName,
  createProvider,
  updateProvider,
  deleteProvider,
  type Provider,
} from '../../db/providers'

/**
 * 创建供应商业务服务
 * 封装 providers 表的完整 CRUD 操作，负责数据库行记录与对外响应对象的转换
 */
export function createProviderService(_db: Database) {
  return {
    /** 获取所有供应商，按创建时间降序排列 */
    list: async (): Promise<ProviderResponse[]> => {
      const providers = listProviders()
      return providers.map(rowToResponse)
    },

    /** 根据 ID 获取单个供应商 */
    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const provider = getProvider(id)
      if (!provider) return undefined
      return rowToResponse(provider)
    },

    /** 根据 name 精确匹配查询供应商（代理路由通过此方法解析模型 ID 中的前缀） */
    getByName: (name: string): Provider | undefined => {
      return getProviderByName(name)
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
 * 将数据库层 Provider 对象转换为对外响应对象（ProviderResponse）
 * 两个类型结构相同，此处显式映射确保字段对齐且未来字段变化不遗漏
 */
function rowToResponse(provider: Provider): ProviderResponse {
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    models: provider.models,
    isActive: provider.isActive,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
