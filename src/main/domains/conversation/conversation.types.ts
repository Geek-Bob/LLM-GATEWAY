/** 会话的对外响应结构，对应 conversations 表 */
export interface ConversationResponse {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 单条消息的对外响应结构，对应 messages 表 */
export interface MessageResponse {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  /** AI 的思考过程（思维链），仅 assistant 消息有值 */
  thinking: string
  created_at: string
}

/** 创建新会话所需的参数 */
export interface CreateConversationInput {
  title: string
  model: string
  /** 关联的供应商 ID，为 null 表示未指定 */
  providerId?: number | null
  /** 关联的 API Key ID，为 null 表示未指定 */
  apiKeyId?: number | null
}

/** 更新会话的可选参数 */
export interface UpdateConversationInput {
  title?: string
  providerId?: number | null
  model?: string
  apiKeyId?: number | null
}

/** 向会话中添加消息所需的参数 */
export interface AddMessageInput {
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  /** AI 的思维链内容，可选 */
  thinking?: string
}
