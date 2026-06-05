import type { Database } from '../../db/database'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'

/**
 * 创建供应商业务服务
 * 封装 providers 表的完整 CRUD 操作，负责数据库行记录与对外响应对象的转换
 */
export function createProviderService(db: Database) {
  return {
    /** 获取所有供应商，按创建时间降序排列 */
    list: async (): Promise<ProviderResponse[]> => {
      const rows = db.prepare(
        'SELECT * FROM providers ORDER BY created_at DESC'
      ).all() as Record<string, unknown>[]

      return rows.map(rowToResponse)
    },

    /** 根据 ID 获取单个供应商 */
    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row) return undefined
      return rowToResponse(row)
    },

    /** 创建新供应商，models 字段会自动序列化为 JSON 字符串 */
    create: async (input: CreateProviderInput): Promise<number> => {
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
    },

    /** 更新供应商信息，动态构建 SET 子句，仅更新传入的字段 */
    update: async (id: number, input: UpdateProviderInput): Promise<void> => {
      // 字段名映射：camelCase 输入 -> snake_case 数据库列
      const columnMap: Record<string, string> = {
        name: 'name', providerType: 'provider_type', baseUrl: 'base_url',
        apiKey: 'api_key', models: 'models', isActive: 'is_active'
      }
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      for (const [key, value] of Object.entries(input)) {
        const col = columnMap[key]
        if (!col) continue
        // models 为数组，需序列化为 JSON 后存储
        params[col] = key === 'models' ? JSON.stringify(value) : value
        setClauses.push(`${col} = @${col}`)
      }

      if (setClauses.length === 0) return
      // 自动更新 updated_at 时间戳
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    /** 根据 ID 删除供应商 */
    remove: async (id: number): Promise<void> => {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    }
  }
}

/**
 * 将数据库行记录（snake_case）转换为对外响应对象（camelCase）
 * models 字段从 JSON 字符串解析为数组
 */
function rowToResponse(row: Record<string, unknown>): ProviderResponse {
  return {
    id: row.id as number,
    name: row.name as string,
    providerType: row.provider_type as string,
    baseUrl: row.base_url as string,
    apiKey: row.api_key as string,
    models: JSON.parse(row.models as string) as string[],
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
