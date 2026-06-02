/**
 * useConversationManager — 会话 CRUD 逻辑封装
 *
 * 封装所有会话操作：切换/新建/删除 + 用户消息保存
 * activeConversationId 由 ChatPage 的 useState 持有，hook 通过参数读写。
 */

import { useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { api } from '@/lib/ipc'
import { useConversations } from '@/lib/queries/conversations'

export const DEFAULT_CONVERSATION_TITLE = '新对话'

export interface UseConversationManagerParams {
  /** 当前活跃会话 ID（由调用方 useState 持有） */
  activeConversationId: number | null
  /** 更新活跃会话 ID */
  setActiveConversationId: (id: number | null) => void
}

export function useConversationManager({ activeConversationId, setActiveConversationId }: UseConversationManagerParams) {
  const { data: conversations = [] } = useConversations()
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] })

  /**
   * 切换会话 — 加载历史消息，恢复 provider/model/apiKey 选择。
   * 返回构造好的消息数组和会话关联的 providerId/model/apiKeyId，
   * 调用方用返回值更新自己的 state。
   */
  async function selectConversation(id: number): Promise<{
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; thinking?: string; isThinking: boolean; isStreaming: boolean }>
    providerId: number | null
    model: string | null
    apiKeyId: number | null
  }> {
    setActiveConversationId(id)

    const [msgs, conv] = await Promise.all([
      api.conversations.messages(id),
      api.conversations.get(id),
    ])

    const messages = msgs.map((m: { role: string; content: string; thinking?: string }) => ({
      id: uuidv4(),
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinking: m.thinking || undefined,
      isThinking: false,
      isStreaming: false,
    }))

    return {
      messages,
      providerId: conv?.provider_id ?? null,
      model: conv?.model ?? null,
      apiKeyId: conv?.api_key_id ?? null,
    }
  }

  /** 新建会话 — 调用方应在调用前先 abort() 和清空 messages */
  function newConversation() {
    setActiveConversationId(null)
    return { providerId: null, model: null, apiKeyId: null }
  }

  /** 删除会话 — confirm 弹窗 + IPC delete。返回 true 表示已删除 */
  async function deleteConversation(id: number, title?: string): Promise<boolean> {
    if (!confirm(`确定删除"${title || '此会话'}"？`)) return false
    await api.conversations.delete(id)
    if (activeConversationId === id) {
      setActiveConversationId(null)
    }
    invalidate()
    return true
  }

  /**
   * 保存用户消息（fire-and-forget 风格）
   * 如果还没有活跃会话，自动创建；更新 providerId/model/apiKeyId 仅在变化时执行
   */
  async function saveUserMessage(
    content: string,
    providerId: number,
    model: string,
    apiKeyId: number
  ): Promise<number | null> {
    let convId = activeConversationId

    if (!convId) {
      const conv = await api.conversations.create({
        title: content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE,
        model,
        providerId,
        apiKeyId,
      })
      convId = conv.id
      setActiveConversationId(convId)
      invalidate()
    } else {
      // 仅当关联信息变化时才更新
      const existing = await api.conversations.get(convId)
      if (existing) {
        const needsUpdate =
          existing.provider_id !== providerId ||
          existing.model !== model ||
          existing.api_key_id !== apiKeyId
        if (needsUpdate) {
          await api.conversations.update(convId, { model, providerId, apiKeyId })
        }
      }
    }

    await api.conversations.addMessage(convId, 'user', content)
    return convId
  }

  return {
    conversations,
    selectConversation,
    newConversation,
    deleteConversation,
    saveUserMessage,
    invalidate,
  }
}
