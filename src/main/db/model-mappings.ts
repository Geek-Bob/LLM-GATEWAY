/**
 * 模型映射数据访问层
 *
 * 封装对 `model_mappings` 表的所有 CRUD 操作。
 * 模型映射用于将客户端请求的 source_model 替换为 target_model，
 * 供 proxy 请求转换时调用。
 */

import { getDb } from './connection'

export interface ModelMappingRow {
  id: number
  sourceModel: string
  targetModel: string
  isActive: number
  createdAt: string
}

/**
 * 将数据库行记录转换为 ModelMappingRow 对象
 */
function rowToModelMapping(row: Record<string, unknown>): ModelMappingRow {
  return {
    id: row.id as number,
    sourceModel: row.source_model as string,
    targetModel: row.target_model as string,
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
  }
}

/**
 * 查找活跃的模型映射（按 sourceModel 精确匹配，仅返回 is_active=1）
 *
 * @param sourceModel - 源模型名称
 * @returns 匹配的活跃映射，未找到时返回 undefined
 */
export function findActiveModelMapping(sourceModel: string): ModelMappingRow | undefined {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM model_mappings WHERE source_model = ? AND is_active = 1')
    .get([sourceModel]) as Record<string, unknown> | undefined

  return row ? rowToModelMapping(row) : undefined
}

/**
 * 查询所有映射（按 id 降序，最新在前）
 *
 * @returns 映射列表
 */
export function listModelMappings(): ModelMappingRow[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM model_mappings ORDER BY id DESC')
    .all() as Record<string, unknown>[]

  return rows.map(rowToModelMapping)
}

/**
 * 创建映射记录
 *
 * @param sourceModel - 源模型名称（UNIQUE 约束）
 * @param targetModel - 目标模型名称
 * @returns 新创建的映射对象（含自增 id）
 */
export function insertModelMapping(sourceModel: string, targetModel: string): ModelMappingRow {
  const db = getDb()
  const result = db
    .prepare('INSERT INTO model_mappings (source_model, target_model) VALUES (?, ?)')
    .run([sourceModel, targetModel])

  const row = db
    .prepare('SELECT * FROM model_mappings WHERE id = ?')
    .get([result.lastInsertRowid]) as Record<string, unknown>

  return rowToModelMapping(row)
}

/**
 * 部分更新映射记录
 *
 * @param id - 映射 id
 * @param updates - 待更新字段（仅传入的字段会被更新）
 */
export function updateModelMapping(
  id: number,
  updates: { sourceModel?: string; targetModel?: string }
): void {
  const db = getDb()
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
}

/**
 * 按 id 查询单条映射
 *
 * @param id - 映射 id
 * @returns 映射对象，未找到时返回 undefined
 */
export function getModelMapping(id: number): ModelMappingRow | undefined {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM model_mappings WHERE id = ?')
    .get([id]) as Record<string, unknown> | undefined

  return row ? rowToModelMapping(row) : undefined
}

/**
 * 按 id 删除映射记录
 *
 * @param id - 映射 id
 */
export function deleteModelMapping(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM model_mappings WHERE id = ?').run([id])
}
