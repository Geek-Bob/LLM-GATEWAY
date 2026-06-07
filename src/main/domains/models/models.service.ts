/**
 * 模型映射业务逻辑
 *
 * 遵循 Domain Pattern 模式 A（工厂注入 service）。
 * 通过 createModelsService(db) 注入 Database 实例，与 provider/conversation 等 domain 统一。
 *
 * 主要职责：
 * - getAllModels(): 聚合所有活跃 provider 的模型列表，供 /v1/models 端点和配置 UI 使用
 * - findModelMapping(): 查找活跃映射，供 proxy 请求转换时调用
 * - CRUD 操作: 管理 model_mappings 表的增删改查
 */

import type { Database } from '../../db/database'
import type {
  ModelMapping,
  CreateModelMappingInput,
  UpdateModelMappingInput,
  ModelInfo,
} from './models.types'

/** 将数据库行记录转换为 ModelMapping 对象 */
function rowToModelMapping(row: Record<string, unknown>): ModelMapping {
  return {
    id: row.id as number,
    sourceModel: row.source_model as string,
    targetModel: row.target_model as string,
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
  }
}

/**
 * 创建模型映射 service 实例
 *
 * 采用依赖注入模式，接收 Database 实例，与 provider/conversation/agent 等 domain 统一。
 *
 * @param db - Database 实例
 * @returns ModelsService 对象
 */
export function createModelsService(db: Database) {
  return {
    /**
     * 获取所有活跃 provider 的模型列表
     *
     * 遍历所有 is_active=1 的 provider，将其 models JSON 数组展开为 ModelInfo 列表。
     * 每个 ModelInfo 的 id 格式为 "{providerName}/{modelName}"。
     * 此函数从 proxy/router.ts 的 getAvailableModels() 迁移而来。
     */
    getAllModels: (): ModelInfo[] => {
      const rows = db
        .prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC')
        .all() as Record<string, unknown>[]

      const result: ModelInfo[] = []
      for (const row of rows) {
        const providerName = row.name as string
        const providerType = row.provider_type as string
        const models = JSON.parse(row.models as string) as string[]
        for (const model of models) {
          result.push({
            id: `${providerName}/${model}`,
            provider: providerName,
            providerType,
          })
        }
      }
      return result
    },

    /**
     * 查找活跃的模型映射
     *
     * 按 sourceModel 精确匹配，仅返回 is_active=1 的记录。
     * 供 proxy 请求转换时调用，将客户端请求的 source_model 替换为 target_model。
     * 未找到映射时返回 null（调用方应使用原始模型名）。
     */
    findModelMapping: (sourceModel: string): ModelMapping | null => {
      const row = db
        .prepare(
          'SELECT * FROM model_mappings WHERE source_model = ? AND is_active = 1'
        )
        .get([sourceModel]) as Record<string, unknown> | undefined

      return row ? rowToModelMapping(row) : null
    },

    /**
     * 查询所有映射（按 id 降序，最新在前）
     *
     * 供 IPC handler 的 list 接口使用，返回完整映射列表。
     */
    listModelMappings: (): ModelMapping[] => {
      const rows = db
        .prepare('SELECT * FROM model_mappings ORDER BY id DESC')
        .all() as Record<string, unknown>[]

      return rows.map(rowToModelMapping)
    },

    /**
     * 创建映射
     *
     * 插入新记录，is_active 默认为 1，created_at 由数据库自动生成。
     * 返回完整的映射对象（含自增 id）。
     * 注意：source_model 有 UNIQUE 约束，重复插入会抛异常。
     */
    createModelMapping: (data: CreateModelMappingInput): ModelMapping => {
      const result = db
        .prepare(
          'INSERT INTO model_mappings (source_model, target_model) VALUES (?, ?)'
        )
        .run([data.sourceModel, data.targetModel])

      const row = db
        .prepare('SELECT * FROM model_mappings WHERE id = ?')
        .get([result.lastInsertRowid]) as Record<string, unknown>

      return rowToModelMapping(row)
    },

    /**
     * 更新映射
     *
     * 仅更新传入的字段，未传入的字段保持不变。
     * 返回更新后的完整映射对象。
     */
    updateModelMapping: (
      id: number,
      data: UpdateModelMappingInput
    ): ModelMapping => {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (data.sourceModel !== undefined) {
        setClauses.push('source_model = ?')
        values.push(data.sourceModel)
      }
      if (data.targetModel !== undefined) {
        setClauses.push('target_model = ?')
        values.push(data.targetModel)
      }

      if (setClauses.length > 0) {
        values.push(id)
        db.prepare(
          `UPDATE model_mappings SET ${setClauses.join(', ')} WHERE id = ?`
        ).run(values)
      }

      const row = db
        .prepare('SELECT * FROM model_mappings WHERE id = ?')
        .get([id]) as Record<string, unknown>

      return rowToModelMapping(row)
    },

    /**
     * 删除映射
     *
     * 按 id 硬删除记录。如需软删除，调用方应使用 updateModelMapping 设置 is_active=0。
     */
    deleteModelMapping: (id: number): void => {
      db.prepare('DELETE FROM model_mappings WHERE id = ?').run([id])
    },
  }
}

/** ModelsService 类型别名，供 IPC handler 和 proxy 层使用 */
export type ModelsService = ReturnType<typeof createModelsService>
