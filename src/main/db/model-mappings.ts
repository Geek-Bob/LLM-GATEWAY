/**
 * ModelMapping 数据访问层（Repository 模式）
 *
 * 封装对 `model_mappings` 表的所有 CRUD 操作。
 * 模型映射用于将客户端请求的 source_model 替换为 target_model，
 * 供 proxy 请求转换时调用。
 */

import type { Database } from './database'

export interface ModelMappingRow {
  id: number
  source_model: string
  target_model: string
  is_active: number
  created_at: string
}

/**
 * 创建 ModelMapping Repository 实例
 *
 * @param db - Database 实例
 * @returns ModelMapping Repository 对象
 */
export function createModelMappingRepository(db: Database) {
  return {
    /** 查询所有映射（按 id 降序，最新在前） */
    async list(): Promise<ModelMappingRow[]> {
      return db.prepare('SELECT * FROM model_mappings ORDER BY id DESC').all() as unknown as ModelMappingRow[]
    },

    /** 按 id 查询单条映射 */
    async findById(id: number): Promise<ModelMappingRow | null> {
      const row = db.prepare('SELECT * FROM model_mappings WHERE id = ?').get(id) as ModelMappingRow | undefined
      return row ?? null
    },

    /** 查找活跃的模型映射（按 source_model 精确匹配，仅返回 is_active=1） */
    async findActive(sourceModel: string): Promise<ModelMappingRow | null> {
      const row = db
        .prepare('SELECT * FROM model_mappings WHERE source_model = ? AND is_active = 1')
        .get(sourceModel) as ModelMappingRow | undefined
      return row ?? null
    },

    /** 创建映射记录 */
    async create(sourceModel: string, targetModel: string): Promise<ModelMappingRow> {
      const result = db
        .prepare('INSERT INTO model_mappings (source_model, target_model) VALUES (?, ?)')
        .run([sourceModel, targetModel])
      const created = await this.findById(result.lastInsertRowid)
      if (!created) throw new Error('Failed to create model mapping: record not found after insert')
      return created
    },

    /** 部分更新映射记录 */
    async update(id: number, updates: { sourceModel?: string; targetModel?: string }): Promise<void> {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (updates.sourceModel !== undefined) {
        setClauses.push('source_model = ?')
        values.push(updates.sourceModel)
      }
      if (updates.targetModel !== undefined) {
        setClauses.push('target_model = ?')
        values.push(updates.targetModel)
      }

      if (setClauses.length === 0) return
      values.push(id)
      db.prepare(`UPDATE model_mappings SET ${setClauses.join(', ')} WHERE id = ?`).run(values)
    },

    /** 按 id 删除映射记录 */
    async remove(id: number): Promise<void> {
      db.prepare('DELETE FROM model_mappings WHERE id = ?').run([id])
    },
  }
}

export type ModelMappingRepository = ReturnType<typeof createModelMappingRepository>
