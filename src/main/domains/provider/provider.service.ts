import type { Database } from '../../db/database'
import type { ProviderResponse, CreateProviderInput, UpdateProviderInput } from './provider.types'

export function createProviderService(db: Database) {
  return {
    list: async (): Promise<ProviderResponse[]> => {
      const rows = db.prepare(
        'SELECT * FROM providers ORDER BY created_at DESC'
      ).all() as Record<string, unknown>[]

      return rows.map(rowToResponse)
    },

    getById: async (id: number): Promise<ProviderResponse | undefined> => {
      const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (!row) return undefined
      return rowToResponse(row)
    },

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

    update: async (id: number, input: UpdateProviderInput): Promise<void> => {
      const columnMap: Record<string, string> = {
        name: 'name', providerType: 'provider_type', baseUrl: 'base_url',
        apiKey: 'api_key', models: 'models', isActive: 'is_active'
      }
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      for (const [key, value] of Object.entries(input)) {
        const col = columnMap[key]
        if (!col) continue
        params[col] = key === 'models' ? JSON.stringify(value) : value
        setClauses.push(`${col} = @${col}`)
      }

      if (setClauses.length === 0) return
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    remove: async (id: number): Promise<void> => {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    }
  }
}

function rowToResponse(row: Record<string, unknown>): ProviderResponse {
  return {
    id: row.id as number,
    name: row.name as string,
    providerType: row.provider_type as string,
    baseUrl: row.base_url as string,
    models: JSON.parse(row.models as string) as string[],
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
