import { getDb } from './connection'
import { decrypt } from '../utils/crypto'

export interface ProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface Provider {
  id: number
  name: string
  providerType: string
  baseUrl: string
  apiKey: string
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface ProviderUpdate {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: number
}

// Maps camelCase TypeScript field names to snake_case SQL column names
const columnMap: Record<string, string> = {
  name: 'name',
  providerType: 'provider_type',
  baseUrl: 'base_url',
  apiKey: 'api_key_encrypted',
  models: 'models',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}

const ENCRYPTION_SECRET = process.env.LLM_GATEWAY_SECRET || 'default-dev-secret'

function tryDecrypt(text: string): string {
  if (!text) return text
  if (text.split(':').length === 3 && text.length > 40) {
    try { return decrypt(text, ENCRYPTION_SECRET) } catch { /* not actually encrypted */ }
  }
  return text
}

function rowToProvider(row: { [key: string]: unknown }): Provider {
  return {
    id: row.id as number,
    name: row.name as string,
    providerType: row.provider_type as string,
    baseUrl: row.base_url as string,
    apiKey: tryDecrypt(row.api_key_encrypted as string),
    models: JSON.parse(row.models as string) as string[],
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export function createProvider(input: ProviderInput): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO providers (name, provider_type, base_url, api_key_encrypted, models)
    VALUES (@name, @providerType, @baseUrl, @apiKeyEncrypted, @models)
  `)
  const result = stmt.run({
    name: input.name,
    providerType: input.providerType,
    baseUrl: input.baseUrl,
    apiKeyEncrypted: input.apiKey,
    models: JSON.stringify(input.models)
  })
  return Number(result.lastInsertRowid)
}

export function getProvider(id: number): Provider | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | { [key: string]: unknown }
    | undefined
  if (!row) return undefined
  return rowToProvider(row)
}

export function getProviderByName(name: string): Provider | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM providers WHERE name = ?').get(name) as
    | { [key: string]: unknown }
    | undefined
  if (!row) return undefined
  return rowToProvider(row)
}

export function listProviders(): Provider[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as {
    [key: string]: unknown
  }[]
  return rows.map(rowToProvider)
}

export function listActiveProviders(): Provider[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC')
    .all() as { [key: string]: unknown }[]
  return rows.map(rowToProvider)
}

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

  // Always update the updated_at timestamp
  setClauses.push("updated_at = datetime('now')")

  db.prepare(`UPDATE providers SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
}

export function deleteProvider(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}
