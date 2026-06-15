import type { Database } from '../../db/database'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'
import { createProviderRepository, type ProviderRow } from '../../db/providers'
import type { ProviderEntity } from '../../../shared/types'

/**
 * 创建供应商业务服务
 * 封装 providers 表的完整 CRUD 操作，负责数据库行记录与对外响应对象的转换
 */
export function createProviderService(db: Database) {
  const repo = createProviderRepository(db)

  return {
    /** 获取所有供应商，按创建时间降序排列 */
    list: async (): Promise<ProviderResponse[]> => {
      const rows = await repo.list()
      return rows.map(providerRowToResponse)
    },

    /** 根据 ID 获取单个供应商 */
    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const row = await repo.findById(id)
      return row ? providerRowToResponse(row) : undefined
    },

    /** 根据 name 精确匹配查询供应商（代理路由通过此方法解析模型 ID 中的前缀） */
    getByName: async (name: string): Promise<ProviderEntity | undefined> => {
      const row = await repo.findByName(name)
      return row ? providerRowToEntity(row) : undefined
    },

    /** 创建新供应商，models 字段会自动序列化为 JSON 字符串 */
    create: async (input: CreateProviderInput): Promise<number> => {
      const created = await repo.create(input)
      return created.id
    },

    /** 更新供应商信息，仅更新传入的字段 */
    update: async (id: number, input: UpdateProviderInput): Promise<void> => {
      await repo.update(id, input)
    },

    /** 根据 ID 删除供应商 */
    remove: async (id: number): Promise<void> => {
      await repo.remove(id)
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

/**
 * 将数据库层 snake_case ProviderRow 转换为强类型 ProviderEntity（内部使用）。
 * 与 providerRowToResponse 的差异：providerType 收窄到 'anthropic' | 'openai' 字面量类型。
 * 运行时安全：ProviderInput 在 db 层已限定为字面量联合类型，存储值不会出现其他字符串。
 */
function providerRowToEntity(row: ProviderRow): ProviderEntity {
  return {
    ...providerRowToResponse(row),
    providerType: row.provider_type as 'anthropic' | 'openai',
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
