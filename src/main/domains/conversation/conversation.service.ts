import type { Database } from '../../db/database'
import type {
  ConversationResponse, MessageResponse,
  CreateConversationInput, UpdateConversationInput, AddMessageInput
} from './conversation.types'
import { createConversationRepository, type ConversationRow, type MessageRow } from '../../db/conversations'

/**
 * 创建会话业务服务
 * 管理会话（conversations）及其消息（messages）的 CRUD 操作
 */
export function createConversationService(db: Database) {
  const repo = createConversationRepository(db)

  return {
    /** 获取所有会话，按更新时间降序排列 */
    list: async (): Promise<ConversationResponse[]> => {
      const rows = await repo.list()
      return rows.map(conversationRowToResponse)
    },

    /** 根据 ID 获取单个会话 */
    getById: async (id: number): Promise<ConversationResponse | undefined> => {
      const row = await repo.findById(id)
      return row ? conversationRowToResponse(row) : undefined
    },

    /** 创建新会话 */
    create: async (input: CreateConversationInput): Promise<ConversationResponse> => {
      const created = await repo.create(
        input.title,
        input.model,
        input.providerId ?? null,
        input.apiKeyId ?? null
      )
      return conversationRowToResponse(created)
    },

    /** 更新会话信息 */
    update: async (id: number, input: UpdateConversationInput): Promise<void> => {
      const data: {
        title?: string
        provider_id?: number | null
        model?: string
        api_key_id?: number | null
      } = {}
      if (input.title !== undefined) data.title = input.title
      if (input.model !== undefined) data.model = input.model
      if (input.providerId !== undefined) data.provider_id = input.providerId
      if (input.apiKeyId !== undefined) data.api_key_id = input.apiKeyId

      await repo.update(id, data)
    },

    /** 根据 ID 删除会话 */
    remove: async (id: number): Promise<void> => {
      await repo.remove(id)
    },

    /** 获取指定会话的全部消息 */
    messages: async (conversationId: number): Promise<MessageResponse[]> => {
      const rows = await repo.listMessages(conversationId)
      return rows.map(messageRowToResponse)
    },

    /** 向指定会话添加一条消息 */
    addMessage: async (input: AddMessageInput): Promise<number> => {
      return repo.addMessage(
        input.conversationId,
        input.role,
        input.content,
        input.thinking
      )
    }
  }
}

/** 将数据库层 snake_case ConversationRow 转换为 camelCase ConversationResponse */
function conversationRowToResponse(row: ConversationRow): ConversationResponse {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    model: row.model,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 将数据库层 snake_case MessageRow 转换为 camelCase MessageResponse */
function messageRowToResponse(row: MessageRow): MessageResponse {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    thinking: row.thinking,
    createdAt: row.created_at,
  }
}

export type ConversationService = ReturnType<typeof createConversationService>
