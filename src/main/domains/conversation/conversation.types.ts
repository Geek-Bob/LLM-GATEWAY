export interface ConversationResponse {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface MessageResponse {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

export interface CreateConversationInput {
  title: string
  model: string
  providerId?: number | null
  apiKeyId?: number | null
}

export interface UpdateConversationInput {
  title?: string
  providerId?: number | null
  model?: string
  apiKeyId?: number | null
}

export interface AddMessageInput {
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}
