/**
 * 模型映射业务逻辑
 *
 * 通过 createModelsService(db) 注入 Database 实例，
 * 内部创建 ProviderRepository 和 ModelMappingRepository 访问数据层。
 *
 * 主要职责：
 * - getAllModels(): 聚合所有活跃 provider 的模型列表，供 /v1/models 端点和配置 UI 使用
 * - findModelMapping(): 查找活跃映射，供 proxy 请求转换时调用
 * - CRUD 操作: 管理 model_mappings 表的增删改查
 */

import type { Database } from '../../db/database'
import { createProviderRepository } from '../../db/providers'
import { createModelMappingRepository, type ModelMappingRow } from '../../db/model-mappings'
import type {
  ModelMapping,
  CreateModelMappingInput,
  UpdateModelMappingInput,
  ModelInfo,
} from './models.types'

/**
 * 创建模型映射 service 实例
 *
 * @param db - Database 实例
 * @returns ModelsService 对象
 */
export function createModelsService(db: Database) {
  const providerRepo = createProviderRepository(db)
  const mappingRepo = createModelMappingRepository(db)

  return {
    /**
     * 获取所有活跃 provider 的模型列表
     *
     * 遍历所有 is_active=1 的 provider，将其 models JSON 数组展开为 ModelInfo 列表。
     * 每个 ModelInfo 的 id 格式为 "{providerName}/{modelName}"。
     */
    getAllModels: async (): Promise<ModelInfo[]> => {
      const providers = await providerRepo.listActive()

      const result: ModelInfo[] = []
      for (const provider of providers) {
        const models = JSON.parse(provider.models) as string[]
        for (const model of models) {
          result.push({
            id: `${provider.name}/${model}`,
            provider: provider.name,
            providerType: provider.provider_type,
          })
        }
      }
      return result
    },

    /**
     * 查找活跃的模型映射
     *
     * 按 sourceModel 精确匹配，仅返回 is_active=1 的记录。
     * 未找到映射时返回 null（调用方应使用原始模型名）。
     */
    findModelMapping: async (sourceModel: string): Promise<ModelMapping | null> => {
      const row = await mappingRepo.findActive(sourceModel)
      return row ? modelMappingRowToEntity(row) : null
    },

    /** 查询所有映射（按 id 降序，最新在前） */
    listModelMappings: async (): Promise<ModelMapping[]> => {
      const rows = await mappingRepo.list()
      return rows.map(modelMappingRowToEntity)
    },

    /** 创建映射 */
    createModelMapping: async (data: CreateModelMappingInput): Promise<ModelMapping> => {
      const created = await mappingRepo.create(data.sourceModel, data.targetModel)
      return modelMappingRowToEntity(created)
    },

    /** 更新映射 */
    updateModelMapping: async (id: number, data: UpdateModelMappingInput): Promise<ModelMapping> => {
      await mappingRepo.update(id, data)
      const row = await mappingRepo.findById(id)
      if (!row) throw new Error(`Failed to update model mapping: id ${id} not found`)
      return modelMappingRowToEntity(row)
    },

    /** 删除映射 */
    deleteModelMapping: async (id: number): Promise<void> => {
      await mappingRepo.remove(id)
    },
  }
}

/** 将数据库层 snake_case ModelMappingRow 转换为 camelCase ModelMapping */
function modelMappingRowToEntity(row: ModelMappingRow): ModelMapping {
  return {
    id: row.id,
    sourceModel: row.source_model,
    targetModel: row.target_model,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

export type ModelsService = ReturnType<typeof createModelsService>
