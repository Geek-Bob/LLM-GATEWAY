/**
 * 模型映射业务逻辑
 *
 * 遵循 Domain Pattern 模式 B（无状态 service，内部通过模块级 import 访问 db）。
 * 提供模型列表查询（从 router.ts 迁移）和 model_mappings 表的 CRUD 操作。
 *
 * 主要职责：
 * - getAllModels(): 聚合所有活跃 provider 的模型列表，供 /v1/models 端点和配置 UI 使用
 * - findModelMapping(): 查找活跃映射，供 proxy 请求转换时调用
 * - CRUD 操作: 管理 model_mappings 表的增删改查
 */

import { getDb } from '../../db/connection'
import { listActiveProviders } from '../../db/providers'
import type {
  ModelMapping,
  CreateModelMappingInput,
  UpdateModelMappingInput,
  ModelInfo,
} from './models.types'

/**
 * 创建模型映射 service 实例
 *
 * 每次调用返回新的 service 对象，但内部共享同一个数据库连接。
 * 适用于 IPC handler 注册和 proxy 层调用。
 */
export function createModelsService() {
  return {
    /**
     * 获取所有活跃 provider 的模型列表
     *
     * 遍历所有 is_active=1 的 provider，将其 models JSON 数组展开为 ModelInfo 列表。
     * 每个 ModelInfo 的 id 格式为 "{providerName}/{modelName}"。
     * 此函数从 proxy/router.ts 的 getAvailableModels() 迁移而来。
     */
    getAllModels: (): ModelInfo[] => {
      const providers = listActiveProviders()
      const result: ModelInfo[] = []
      for (const p of providers) {
        for (const model of p.models) {
          result.push({
            id: `${p.name}/${model}`,
            provider: p.name,
            providerType: p.providerType,
          })
        }
      }
      return result
    },

    /**
     * 查找活跃的模型映射
     *
     * 按 providerType + sourceModel 精确匹配，仅返回 is_active=1 的记录。
     * 供 proxy 请求转换时调用，将客户端请求的 source_model 替换为 target_model。
     * 未找到映射时返回 null（调用方应使用原始模型名）。
     */
    findModelMapping: (
      providerType: string,
      sourceModel: string
    ): ModelMapping | null => {
      const db = getDb()
      const row = db
        .prepare(
          'SELECT * FROM model_mappings WHERE provider_type = ? AND source_model = ? AND is_active = 1'
        )
        .get([providerType, sourceModel]) as Record<string, unknown> | undefined

      if (!row) return null

      return {
        id: row.id as number,
        providerType: row.provider_type as string,
        sourceModel: row.source_model as string,
        targetModel: row.target_model as string,
        isActive: row.is_active as number,
        createdAt: row.created_at as string,
      }
    },

    /**
     * 查询所有映射（按 id 降序，最新在前）
     *
     * 供 IPC handler 的 list 接口使用，返回完整映射列表。
     */
    listModelMappings: (): ModelMapping[] => {
      const db = getDb()
      const rows = db
        .prepare('SELECT * FROM model_mappings ORDER BY id DESC')
        .all() as Record<string, unknown>[]

      return rows.map((row) => ({
        id: row.id as number,
        providerType: row.provider_type as string,
        sourceModel: row.source_model as string,
        targetModel: row.target_model as string,
        isActive: row.is_active as number,
        createdAt: row.created_at as string,
      }))
    },

    /**
     * 创建映射
     *
     * 插入新记录，is_active 默认为 1，created_at 由数据库自动生成。
     * 返回完整的映射对象（含自增 id）。
     * 注意：provider_type + source_model 有 UNIQUE 约束，重复插入会抛异常。
     */
    createModelMapping: (data: CreateModelMappingInput): ModelMapping => {
      const db = getDb()
      const result = db
        .prepare(
          'INSERT INTO model_mappings (provider_type, source_model, target_model) VALUES (?, ?, ?)'
        )
        .run([data.providerType, data.sourceModel, data.targetModel])

      // 查询刚创建的记录，返回完整对象
      const row = db
        .prepare('SELECT * FROM model_mappings WHERE id = ?')
        .get([result.lastInsertRowid]) as Record<string, unknown>

      return {
        id: row.id as number,
        providerType: row.provider_type as string,
        sourceModel: row.source_model as string,
        targetModel: row.target_model as string,
        isActive: row.is_active as number,
        createdAt: row.created_at as string,
      }
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
      const db = getDb()
      const setClauses: string[] = []
      const values: unknown[] = []

      // 动态构建 SET 子句，仅包含传入的字段
      if (data.providerType !== undefined) {
        setClauses.push('provider_type = ?')
        values.push(data.providerType)
      }
      if (data.sourceModel !== undefined) {
        setClauses.push('source_model = ?')
        values.push(data.sourceModel)
      }
      if (data.targetModel !== undefined) {
        setClauses.push('target_model = ?')
        values.push(data.targetModel)
      }

      // 有字段需要更新时才执行 SQL
      if (setClauses.length > 0) {
        values.push(id)
        db.prepare(
          `UPDATE model_mappings SET ${setClauses.join(', ')} WHERE id = ?`
        ).run(values)
      }

      // 查询更新后的记录
      const row = db
        .prepare('SELECT * FROM model_mappings WHERE id = ?')
        .get([id]) as Record<string, unknown>

      return {
        id: row.id as number,
        providerType: row.provider_type as string,
        sourceModel: row.source_model as string,
        targetModel: row.target_model as string,
        isActive: row.is_active as number,
        createdAt: row.created_at as string,
      }
    },

    /**
     * 删除映射
     *
     * 按 id 硬删除记录。如需软删除，调用方应使用 updateModelMapping 设置 is_active=0。
     */
    deleteModelMapping: (id: number): void => {
      const db = getDb()
      db.prepare('DELETE FROM model_mappings WHERE id = ?').run([id])
    },
  }
}

/** ModelsService 类型别名，供 IPC handler 和 proxy 层使用 */
export type ModelsService = ReturnType<typeof createModelsService>
