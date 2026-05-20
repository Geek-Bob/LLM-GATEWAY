import { getDb } from './connection'

export interface ConversationRow {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

export function listConversations(): ConversationRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as ConversationRow[]
}

export function createConversation(
  title: string,
  model: string,
  providerId?: number | null,
  apiKeyId?: number | null
): number {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO conversations (title, provider_id, model, api_key_id)
       VALUES (@title, @provider_id, @model, @api_key_id)`
    )
    .run({
      title,
      provider_id: providerId ?? null,
      model,
      api_key_id: apiKeyId ?? null
    })
  return result.lastInsertRowid
}

export function updateConversation(
  id: number,
  data: {
    title?: string
    provider_id?: number | null
    model?: string
    api_key_id?: number | null
  }
): void {
  const db = getDb()
  const fields: string[] = ["updated_at = datetime('now')"]
  const params: Record<string, unknown> = { id }

  if (data.title !== undefined) {
    fields.push('title = @title')
    params.title = data.title
  }
  if (data.provider_id !== undefined) {
    fields.push('provider_id = @provider_id')
    params.provider_id = data.provider_id
  }
  if (data.model !== undefined) {
    fields.push('model = @model')
    params.model = data.model
  }
  if (data.api_key_id !== undefined) {
    fields.push('api_key_id = @api_key_id')
    params.api_key_id = data.api_key_id
  }

  db.prepare(
    `UPDATE conversations SET ${fields.join(', ')} WHERE id = @id`
  ).run(params)
}

export function deleteConversation(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function getConversation(id: number): ConversationRow | undefined {
  const db = getDb()
  return db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined
}

export function listMessages(conversationId: number): MessageRow[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC'
    )
    .all(conversationId) as MessageRow[]
}

export function addMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
  thinking?: string
): number {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO messages (conversation_id, role, content, thinking)
       VALUES (@conversation_id, @role, @content, @thinking)`
    )
    .run({
      conversation_id: conversationId,
      role,
      content,
      thinking: thinking || ''
    })

  db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).run(conversationId)

  return result.lastInsertRowid
}
