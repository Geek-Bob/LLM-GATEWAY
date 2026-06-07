/**
 * LLM 供应商数据访问层
 *
 * 本模块封装对 `providers` 表的所有 CRUD 操作。
 * Provider 记录的是上游 LLM 服务（如 Anthropic、OpenAI）的连接信息，
 * 包括 API 地址、密钥以及该供应商支持的白名单模型列表。
 *
 * 关键设计决策：
 * - models 字段在 SQLite 中以 JSON 字符串存储，读写时自行序列化/反序列化
 * - 字段映射采用显式 columnMap 对象，便于在 update 时精确控制 SQL 列名
 * - is_active = 1 表示激活，代理路由只会选中活跃供应商
 */

import { getDb } from './connection'

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

/** 创建供应商记录，models 数组序列化为 JSON 存入数据库，返回自增主键 ID。 */
export function createProvider(input: ProviderInput): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO providers (name, provider_type, base_url, api_key, models)
    VALUES (@name, @providerType, @baseUrl, @apiKey, @models)
  `)
  const result = stmt.run({
    name: input.name,
    providerType: input.providerType,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    models: JSON.stringify(input.models)
  })
  return Number(result.lastInsertRowid)
}

/** 按主键查询单个供应商，找不到时返回 undefined 而非抛异常。 */
export function getProvider(id: number): ProviderRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
}

/** 按 name 精确匹配查询供应商（代理路由通过此函数解析模型 ID 中的前缀）。 */
export function getProviderByName(name: string): ProviderRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM providers WHERE name = ?').get(name) as
    | ProviderRow
    | undefined
}

/** 列出所有供应商，按创建时间降序排列（新创建的排前面）。 */
export function listProviders(): ProviderRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as ProviderRow[]
}

/**
 * 仅列出活跃供应商（is_active = 1）。
 * 代理路由 resolveProvider() 依赖此函数，不活跃的供应商不会被选中做请求转发。
 */
export function listActiveProviders(): ProviderRow[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC')
    .all() as ProviderRow[]
}

/**
 * 部分更新供应商字段。关键设计点：
 * - 仅遍历提供的更新字段，不存在的字段不会影响数据库
 * - models 数组在此序列化为 JSON 字符串
 * - 使用 columnMap 字段白名单，避免传入意外字段
 * - 每次更新自动刷新 updated_at 时间戳
 */
export function updateProvider(id: number, updates: ProviderUpdate): void {
  const db = getDb()

  const setClauses: string[] = []
  const params: Record<string, unknown> = { id }

  for (const [key, value] of Object.entries(updates)) {
    const column = columnMap[key]
    if (!column) continue

    if (key === 'models') {
      params[column] = JSON.stringify(value)
    } else {
      params[column] = value
    }
    setClauses.push(`${column} = @${column}`)
  }

  if (setClauses.length === 0) return

  // 每次更新自动刷新 updated_at 时间戳
  setClauses.push("updated_at = datetime('now')")

  db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
}

/** 按主键删除供应商。注意：相关联的会话记录不会级联删除，调用方需自行处理。 */
export function deleteProvider(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}
