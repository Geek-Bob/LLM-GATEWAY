/**
 * useChatPage — Chat 页面编排 Hook
 *
 * 职责：组合 useProviders、useApiKeys、useConversationManager、useChatStream，
 * 管理页面级状态（选择、消息、侧栏），返回 JSX 所需的全部数据和回调。
 *
 * 页面组件 ChatPage 仅负责布局和 JSX 组装，不含任何业务逻辑。
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'

import { api } from '@/lib/ipc'
import { setApiKey } from '@/lib/api-client'
import { useChatStream } from '@/features/chat/hooks/useChatStream'
import {
  useConversationManager,
  DEFAULT_CONVERSATION_TITLE,
} from '@/features/chat/hooks/useConversationManager'
import type { StreamMessage, ThinkingConfig } from '@/features/chat/hooks/useChatStream'
import type { ThinkingType, ReasoningEffort } from '../../../../shared/types'

import { useProviders } from '@/lib/queries/providers'
import { useApiKeys } from '@/lib/queries/apiKeys'
import type { Message } from '@/features/chat/components/MessageList'

/**
 * Chat 页面编排 hook，返回页面所需的全部数据和回调。
 */
/** Chat 页面编排 Hook，组合数据层和业务层 hooks，返回页面所需的全部数据和回调。 @returns 包含消息、选择状态、操作回调的对象。 */
export function useChatPage() {
  // ─── 数据层 ───
  const { data: providers = [] } = useProviders()
  const { data: activeApiKeys = [] } = useApiKeys()

  // ─── 选择状态 ───
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<number | null>(null)

  // ─── 思考设置状态（与对话绑定：切对话同步、修改持久化、发送传参）───
  const [thinkingType, setThinkingType] = useState<ThinkingType>('disabled')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium')
  // 供 useConversationManager.saveUserMessage 在新建/更新对话时携带当前思考设置
  const getThinkingConfig = useCallback((): ThinkingConfig => ({
    thinkingType,
    reasoningEffort,
  }), [thinkingType, reasoningEffort])

  // ─── 会话 + 消息状态 ───
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const convIdRef = useRef(activeConversationId)
  useEffect(() => { convIdRef.current = activeConversationId }, [activeConversationId])

  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    conversations,
    selectConversation,
    newConversation,
    deleteConversation,
    saveUserMessage,
    invalidate: invalidateConversations,
  } = useConversationManager({ activeConversationId, setActiveConversationId, getThinkingConfig })

  // ─── 派生数据 ───
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const availableModels = selectedProvider?.models ?? []
  const providerOptions = providers.filter((p) => p.isActive === 1)
  const keyOptions = activeApiKeys.filter((k) => k.isActive === 1)

  // ─── 滚动 ───
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  // ─── API Key 管理 ───
  const ensureApiKey = useCallback(() => {
    const match = activeApiKeys.find((k) => k.id === selectedApiKeyId)
    if (match?.keyPlaintext) setApiKey(match.keyPlaintext)
  }, [activeApiKeys, selectedApiKeyId])

  // ─── SSE 流回调 (convIdRef 避免闭包陷阱) ───
  const handleStreamUpdate = useCallback((msg: StreamMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== 'assistant') {
        return [...prev, {
          id: msg.id,
          role: 'assistant' as const,
          content: msg.content,
          thinking: msg.thinking,
          isThinking: msg.isThinking,
          model: selectedModel || undefined,
          isStreaming: msg.isStreaming,
          hasError: msg.hasError,
        }]
      }
      return prev.with(-1, {
        ...last,
        content: msg.content,
        thinking: msg.thinking,
        isThinking: msg.isThinking,
        isStreaming: msg.isStreaming,
        hasError: msg.hasError,
      })
    })

    if (!msg.isStreaming && !msg.hasError && convIdRef.current && msg.content) {
      api.conversations.addMessage({ conversationId: convIdRef.current, role: 'assistant', content: msg.content, thinking: msg.thinking || '' })
        .then(() => api.conversations.get(convIdRef.current!))
        .then((conv) => {
          if (conv && conv.title === DEFAULT_CONVERSATION_TITLE) {
            return api.conversations.update(convIdRef.current!, { title: msg.content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE })
          }
        })
        .then(() => { invalidateConversations() })
        .catch((e) => {
          console.error('[ChatPage] Title update failed', e)
          toast.error('对话标题更新失败')
        })
    }
  }, [selectedModel, invalidateConversations])

  const { send, abort, isLoading: streamLoading } = useChatStream(handleStreamUpdate)

  // ─── 发送消息 ───
  const handleSend = useCallback(async (content: string) => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    ensureApiKey()

    const userMessage: Message = { id: uuidv4(), role: 'user', content }
    setMessages((prev) => [...prev, userMessage])

    saveUserMessage(content, selectedProvider.id, selectedModel, selectedApiKeyId)
      .catch((e) => {
        console.error('[ChatPage] Message save failed', e)
        toast.error('消息保存失败，请重试')
      })

    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ], { thinkingType, reasoningEffort })
  }, [selectedModel, selectedApiKeyId, selectedProvider, ensureApiKey, saveUserMessage, send, messages, thinkingType, reasoningEffort])

  // ─── 其他操作 ───
  const handleStop = useCallback(() => { abort() }, [abort])

  const handleRegenerate = useCallback(async () => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return

    ensureApiKey()

    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, apiMessages, { thinkingType, reasoningEffort })
    setMessages((prev) => prev.slice(0, -1))
  }, [selectedModel, selectedApiKeyId, selectedProvider, messages, ensureApiKey, send, thinkingType, reasoningEffort])

  const handleSelectConversation = useCallback(async (id: number) => {
    const result = await selectConversation(id)
    setMessages(result.messages)
    setSelectedProviderId(result.providerId)
    setSelectedModel(result.model)
    setSelectedApiKeyId(result.apiKeyId)
    // 同步目标对话的思考设置（旧对话无值时 selectConversation 已回退 disabled/medium）
    setThinkingType(result.thinkingType)
    setReasoningEffort(result.reasoningEffort)
  }, [selectConversation])

  const handleNewConversation = useCallback(() => {
    abort()
    setMessages([])
    newConversation()
    setSelectedProviderId(null)
    setSelectedModel(null)
    setSelectedApiKeyId(null)
    // 新建对话思考设置重置为默认 disabled/medium
    setThinkingType('disabled')
    setReasoningEffort('medium')
    setInputKey(k => k + 1)
  }, [abort, newConversation])

  const handleDeleteConversation = useCallback(async (id: number) => {
    const conv = conversations.find(c => c.id === id)
    const deleted = await deleteConversation(id, conv?.title)
    if (deleted) {
      setMessages([])
      setInputKey(k => k + 1)
    }
  }, [conversations, deleteConversation])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  // ─── 思考设置修改：更新本地状态 + 持久化（已有活跃对话时）───
  // 用 convIdRef 读取最新对话 ID，避免闭包捕获过期的 activeConversationId（与 handleStreamUpdate 同模式）
  const persistThinkingSetting = useCallback((
    patch: Partial<{ thinkingType: ThinkingType; reasoningEffort: ReasoningEffort }>,
  ) => {
    const convId = convIdRef.current
    if (!convId) return
    api.conversations.update(convId, patch)
      .then(() => invalidateConversations())
      .catch((e) => {
        console.error('[ChatPage] Thinking setting persist failed', e)
        toast.error('思考设置保存失败')
      })
  }, [invalidateConversations])

  const onThinkingTypeChange = useCallback((type: ThinkingType) => {
    setThinkingType(type)
    persistThinkingSetting({ thinkingType: type })
  }, [persistThinkingSetting])

  const onReasoningEffortChange = useCallback((effort: ReasoningEffort) => {
    setReasoningEffort(effort)
    persistThinkingSetting({ reasoningEffort: effort })
  }, [persistThinkingSetting])

  return {
    // 数据
    conversations,
    messages,
    messagesEndRef,
    activeConversationId,
    // 选择状态
    selectedProviderId,
    setSelectedProviderId,
    selectedModel,
    setSelectedModel,
    selectedApiKeyId,
    setSelectedApiKeyId,
    // 派生数据
    providerOptions,
    availableModels,
    keyOptions,
    // 思考设置
    thinkingType,
    reasoningEffort,
    onThinkingTypeChange,
    onReasoningEffortChange,
    // UI 状态
    sidebarCollapsed,
    toggleSidebar,
    inputKey,
    streamLoading,
    // 回调
    handleSend,
    handleStop,
    handleRegenerate,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
  }
}
