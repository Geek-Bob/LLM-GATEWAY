/**
 * Provider 数据访问层（Repository 模式）
 *
 * 封装对 `providers` 表的所有 CRUD 操作。
 * Provider 记录的是上游 LLM 服务（如 Anthropic、OpenAI）的连接信息，
 * 包括 API 地址、密钥以及该供应商支持的白名单模型列表。
 *
 * 关键设计决策：
 * - models 字段在 SQLite 中以 JSON 字符串存储，读写时自行序列化/反序列化
 * - 字段映射采用显式 columnMap 对象，便于在 update 时精确控制 SQL 列名
 * - is_active = 1 表示激活，代理路由只会选中活跃供应商
 */

import type { Database } from './database'

export interface ProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface ProviderRow {
  id: number
  name: string
  provider_type: string
  base_url: string
  api_key: string
  /** JSON 序列化的模型名数组，如 '["gpt-4","gpt-3.5-turbo"]' */
  models: string
  is_active: number
  created_at: string
  updated_at: string
}

interface ProviderUpdate {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: number
}

/**
 * TypeScript 驼峰字段名到 SQLite 蛇形列名的显式映射。
 * 选择显式映射而非自动转换的原因：
 * 1. 精确控制哪些字段可参与更新，避免意外覆盖
 * 2. 预留未来字段重命名时只需改此处一处
 */
const columnMap: Record<string, string> = {
  name: 'name',
  providerType: 'provider_type',
  baseUrl: 'base_url',
  apiKey: 'api_key',
  models: 'models',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}

/**
 * 创建 Provider Repository 实例
 *
 * @param db - Database 实例
 * @returns Provider Repository 对象
 */
export function createProviderRepository(db: Database) {
  return {
    /** 列出所有供应商，按创建时间降序排列 */
    async list(): Promise<ProviderRow[]> {
      return db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as unknown as ProviderRow[]
    },

    /** 按主键查询单个供应商 */
    async findById(id: number): Promise<ProviderRow | null> {
      const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined
      return row ?? null
    },

    /** 按 name 精确匹配查询供应商（代理路由通过此方法解析模型 ID 中的前缀） */
    async findByName(name: string): Promise<ProviderRow | null> {
      const row = db.prepare('SELECT * FROM providers WHERE name = ?').get(name) as ProviderRow | undefined
      return row ?? null
    },

    /** 仅列出活跃供应商（is_active = 1） */
    async listActive(): Promise<ProviderRow[]> {
      return db
        .prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC')
        .all() as unknown as ProviderRow[]
    },

    /** 列出所有供应商的 id 和 name，用于关联查询（如日志统计中显示供应商名称） */
    async listNames(): Promise<{ id: number; name: string }[]> {
      return db.prepare('SELECT id, name FROM providers').all() as { id: number; name: string }[]
    },

    /** 创建供应商记录，models 数组序列化为 JSON 存入数据库 */
    async create(input: ProviderInput): Promise<ProviderRow> {
      const result = db.prepare(`
        INSERT INTO providers (name, provider_type, base_url, api_key, models)
        VALUES (@name, @providerType, @baseUrl, @apiKey, @models)
      `).run({
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        models: JSON.stringify(input.models)
      })
      const created = await this.findById(result.lastInsertRowid)
      if (!created) throw new Error('Failed to create provider: record not found after insert')
      return created
    },

    /** 部分更新供应商字段 */
    async update(id: number, updates: ProviderUpdate): Promise<void> {
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      for (const [key, value] of Object.entries(updates)) {
        const column = columnMap[key]
        if (!column) continue
        params[column] = key === 'models' ? JSON.stringify(value) : value
        setClauses.push(`${column} = @${column}`)
      }

      if (setClauses.length === 0) return
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    /** 按主键删除供应商 */
    async remove(id: number): Promise<void> {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    },
  }
}

export type ProviderRepository = ReturnType<typeof createProviderRepository>
