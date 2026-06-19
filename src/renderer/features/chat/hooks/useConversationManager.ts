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
import type { ThinkingType, ReasoningEffort } from '../../../../shared/types'
import type { ThinkingConfig } from '@/features/chat/hooks/useChatStream'

export const DEFAULT_CONVERSATION_TITLE = '新对话'

/** UI 默认思考设置：执行方式 disabled、强度 medium（仅 thinkingType≠disabled 时才外发 effort）。 */
export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  thinkingType: 'disabled',
  reasoningEffort: 'medium',
}

export interface UseConversationManagerParams {
  /** 当前活跃会话 ID（由调用方 useState 持有） */
  activeConversationId: number | null
  /** 更新活跃会话 ID */
  setActiveConversationId: (id: number | null) => void
  /**
   * 读取当前思考设置（由调用方 useChatPage 持有的 thinkingType/reasoningEffort 状态派生）。
   * saveUserMessage 在新建/更新对话时携带此设置；未提供时回退默认 disabled/medium（向后兼容）。
   */
  getThinkingConfig?: () => ThinkingConfig
}

/** 会话 CRUD 逻辑封装 Hook，管理切换/新建/删除会话及用户消息保存。 @param params - 包含 activeConversationId 及其 setter。 @returns 会话列表和操作方法。 */
export function useConversationManager({ activeConversationId, setActiveConversationId, getThinkingConfig }: UseConversationManagerParams) {
  const { data: conversations = [] } = useConversations()
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })

  /**
   * 切换会话 — 加载历史消息，恢复 provider/model/apiKey 选择。
   * 返回构造好的消息数组、会话关联的 providerId/model/apiKeyId，
   * 以及对话的思考设置（旧对话无值时回退默认 disabled/medium，供调用方同步 UI）。
   * 调用方用返回值更新自己的 state。
   */
  async function selectConversation(id: number): Promise<{
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; thinking?: string; isThinking: boolean; isStreaming: boolean }>
    providerId: number | null
    model: string | null
    apiKeyId: number | null
    thinkingType: ThinkingType
    reasoningEffort: ReasoningEffort
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
      providerId: conv?.providerId ?? null,
      model: conv?.model ?? null,
      apiKeyId: conv?.apiKeyId ?? null,
      // 旧对话无值（NULL/undefined）视为默认 disabled/medium
      thinkingType: conv?.thinkingType ?? 'disabled',
      reasoningEffort: conv?.reasoningEffort ?? 'medium',
    }
  }

  /** 新建会话 — 调用方应在调用前先 abort() 和清空 messages */
  function newConversation() {
    setActiveConversationId(null)
    return { providerId: null, model: null, apiKeyId: null }
  }

  /** 删除会话 — 直接 IPC delete，返回 true 表示已删除 */
  async function deleteConversation(id: number, _title?: string): Promise<boolean> {
    await api.conversations.delete(id)
    if (activeConversationId === id) {
      setActiveConversationId(null)
    }
    invalidate()
    return true
  }

  /**
   * 保存用户消息（fire-and-forget 风格）
   * 如果还没有活跃会话，自动创建（携带当前思考设置）；已有会话时，
   * 仅当 providerId/model/apiKeyId 或思考设置变化时才执行 update。
   */
  async function saveUserMessage(
    content: string,
    providerId: number,
    model: string,
    apiKeyId: number
  ): Promise<number | null> {
    // 在调用时读取最新思考设置（getThinkingConfig 由调用方每次渲染传入，闭包捕获最新 state）
    const { thinkingType, reasoningEffort } = getThinkingConfig?.() ?? DEFAULT_THINKING_CONFIG
    let convId = activeConversationId

    if (!convId) {
      const conv = await api.conversations.create({
        title: content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE,
        model,
        providerId,
        apiKeyId,
        thinkingType,
        reasoningEffort,
      })
      convId = conv.id
      setActiveConversationId(convId)
      invalidate()
    } else {
      // 仅当关联信息或思考设置变化时才更新
      const existing = await api.conversations.get(convId)
      if (existing) {
        // 思考设置比较采用直接相等（旧对话 NULL→undefined 与当前默认值不等，触发一次惰性归一化写入）
        const needsUpdate =
          existing.providerId !== providerId ||
          existing.model !== model ||
          existing.apiKeyId !== apiKeyId ||
          existing.thinkingType !== thinkingType ||
          existing.reasoningEffort !== reasoningEffort
        if (needsUpdate) {
          await api.conversations.update(convId, { model, providerId, apiKeyId, thinkingType, reasoningEffort })
        }
      }
    }

    await api.conversations.addMessage({ conversationId: convId, role: 'user', content })
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
