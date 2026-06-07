import type { Database } from '../../db/database'
import type {
  ConversationResponse, MessageResponse,
  CreateConversationInput, UpdateConversationInput, AddMessageInput
} from './conversation.types'
import {
  listConversations, getConversation, createConversation as dbCreateConversation,
  updateConversation as dbUpdateConversation, deleteConversation,
  listMessages, addMessage as dbAddMessage
} from '../../db/conversations'

/**
 * 创建会话业务服务
 * 管理会话（conversations）及其消息（messages）的 CRUD 操作
 * 一个会话包含多条消息，按创建时间正序排列
 *
 * 所有数据操作委托给 db/conversations.ts，本层仅负责：
 * - 输入格式转换（camelCase -> snake_case）
 * - 返回类型映射
 */
export function createConversationService(db: Database) {
  return {
    /** 获取所有会话，按更新时间降序排列（最近使用的排前面） */
    list: async (): Promise<ConversationResponse[]> => {
      return listConversations(db) as ConversationResponse[]
    },

    /** 根据 ID 获取单个会话 */
    getById: async (id: number): Promise<ConversationResponse | undefined> => {
      return getConversation(db, id) as ConversationResponse | undefined
    },

    /** 创建新会话，若未指定 providerId/apiKeyId 则存为 null */
    create: async (input: CreateConversationInput): Promise<ConversationResponse> => {
      const id = dbCreateConversation(
        db,
        input.title,
        input.model,
        input.providerId ?? null,
        input.apiKeyId ?? null
      )
      const conv = getConversation(db, id) as ConversationResponse | undefined
      if (!conv) {
        throw new Error(`Failed to create conversation: record ${id} not found after insert`)
      }
      return conv
    },

    /** 更新会话信息，将 camelCase 输入转换为 snake_case 后委托数据层 */
    update: async (id: number, input: UpdateConversationInput): Promise<void> => {
      // camelCase 输入 -> snake_case 数据库列
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

      dbUpdateConversation(db, id, data)
    },

    /** 根据 ID 删除会话 */
    remove: async (id: number): Promise<void> => {
      deleteConversation(db, id)
    },

    /** 获取指定会话的全部消息，按创建时间正序排列 */
    messages: async (conversationId: number): Promise<MessageResponse[]> => {
      return listMessages(db, conversationId) as MessageResponse[]
    },

    /** 向指定会话添加一条消息，同时更新会话的 updated_at */
    addMessage: async (input: AddMessageInput): Promise<number> => {
      return dbAddMessage(
        db,
        input.conversationId,
        input.role,
        input.content,
        input.thinking
      )
    }
  }
}

export type ConversationService = ReturnType<typeof createConversationService>
