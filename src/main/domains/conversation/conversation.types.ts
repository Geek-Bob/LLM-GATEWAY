import type { ThinkingType, ReasoningEffort } from '../../../shared/types'

/** 会话的对外响应结构，对应 conversations 表 */
export interface ConversationResponse {
  id: number
  title: string
  providerId: number | null
  model: string
  apiKeyId: number | null
  /** 思考执行方式，旧对话为 undefined（视为 disabled，向后兼容） */
  thinkingType?: ThinkingType
  /** 思考强度偏好，旧对话为 undefined（表示不传 effort） */
  reasoningEffort?: ReasoningEffort
  createdAt: string
  updatedAt: string
}

/** 单条消息的对外响应结构，对应 messages 表 */
export interface MessageResponse {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  /** AI 的思考过程（思维链），仅 assistant 消息有值 */
  thinking: string
  createdAt: string
}

/** 创建新会话所需的参数 */
export interface CreateConversationInput {
  title: string
  model: string
  /** 关联的供应商 ID，为 null 表示未指定 */
  providerId?: number | null
  /** 关联的 API Key ID，为 null 表示未指定 */
  apiKeyId?: number | null
  /** 思考执行方式，未传时落库 NULL（视为 disabled） */
  thinkingType?: ThinkingType
  /** 思考强度偏好，未传时落库 NULL（表示不传 effort） */
  reasoningEffort?: ReasoningEffort
}

/** 更新会话的可选参数 */
export interface UpdateConversationInput {
  title?: string
  providerId?: number | null
  model?: string
  apiKeyId?: number | null
  /** 思考执行方式，未传时不改动该字段（部分更新语义） */
  thinkingType?: ThinkingType
  /** 思考强度偏好，未传时不改动该字段 */
  reasoningEffort?: ReasoningEffort
}

/** 向会话中添加消息所需的参数 */
export interface AddMessageInput {
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  /** AI 的思维链内容，可选 */
  thinking?: string
}
