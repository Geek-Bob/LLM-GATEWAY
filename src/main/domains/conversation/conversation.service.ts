import type { Database } from '../../db/database'
import type {
  ConversationResponse, MessageResponse,
  CreateConversationInput, UpdateConversationInput, AddMessageInput
} from './conversation.types'

export function createConversationService(db: Database) {
  return {
    list: async (): Promise<ConversationResponse[]> => {
      return db.prepare(
        'SELECT * FROM conversations ORDER BY updated_at DESC'
      ).all() as ConversationResponse[]
    },

    getById: async (id: number): Promise<ConversationResponse | undefined> => {
      return db.prepare(
        'SELECT * FROM conversations WHERE id = ?'
      ).get(id) as ConversationResponse | undefined
    },

    create: async (input: CreateConversationInput): Promise<number> => {
      const result = db.prepare(`
        INSERT INTO conversations (title, model, provider_id, api_key_id)
        VALUES (@title, @model, @providerId, @apiKeyId)
      `).run({
        title: input.title,
        model: input.model,
        providerId: input.providerId ?? null,
        apiKeyId: input.apiKeyId ?? null
      })
      return Number(result.lastInsertRowid)
    },

    update: async (id: number, input: UpdateConversationInput): Promise<void> => {
      const setClauses: string[] = []
      const params: Record<string, unknown> = { id }

      const fieldMap: Record<string, string> = {
        title: 'title', model: 'model',
        providerId: 'provider_id', apiKeyId: 'api_key_id'
      }
      for (const [key, value] of Object.entries(input)) {
        const col = fieldMap[key]
        if (!col || value === undefined) continue
        params[col] = value
        setClauses.push(`${col} = @${col}`)
      }

      if (setClauses.length === 0) return
      setClauses.push("updated_at = datetime('now')")
      db.prepare(`UPDATE conversations SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
    },

    remove: async (id: number): Promise<void> => {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },

    messages: async (conversationId: number): Promise<MessageResponse[]> => {
      return db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).all(conversationId) as MessageResponse[]
    },

    addMessage: async (input: AddMessageInput): Promise<number> => {
      const result = db.prepare(`
        INSERT INTO messages (conversation_id, role, content, thinking)
        VALUES (@conversationId, @role, @content, @thinking)
      `).run({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        thinking: input.thinking || ''
      })
      return Number(result.lastInsertRowid)
    }
  }
}

export type ConversationService = ReturnType<typeof createConversationService>
