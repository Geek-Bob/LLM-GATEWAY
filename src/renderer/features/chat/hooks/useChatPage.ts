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

import { api } from '@/lib/ipc'
import { setApiKey } from '@/lib/api-client'
import { useChatStream } from '@/features/chat/hooks/useChatStream'
import {
  useConversationManager,
  DEFAULT_CONVERSATION_TITLE,
} from '@/features/chat/hooks/useConversationManager'
import type { StreamMessage } from '@/features/chat/hooks/useChatStream'

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
  } = useConversationManager({ activeConversationId, setActiveConversationId })

  // ─── 派生数据 ───
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const availableModels = selectedProvider?.models ?? []
  const providerOptions = providers.filter((p) => p.isActive === 1)
  const keyOptions = activeApiKeys.filter((k) => k.is_active === 1)

  // ─── 滚动 ───
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  // ─── API Key 管理 ───
  const ensureApiKey = useCallback(() => {
    const match = activeApiKeys.find((k) => k.id === selectedApiKeyId)
    if (match?.key_plaintext) setApiKey(match.key_plaintext)
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
          error: msg.error,
        }]
      }
      return prev.with(-1, {
        ...last,
        content: msg.content,
        thinking: msg.thinking,
        isThinking: msg.isThinking,
        isStreaming: msg.isStreaming,
        error: msg.error,
      })
    })

    if (!msg.isStreaming && !msg.error && convIdRef.current && msg.content) {
      api.conversations.addMessage(convIdRef.current, 'assistant', msg.content, msg.thinking || '')
        .then(() => api.conversations.get(convIdRef.current!))
        .then((conv) => {
          if (conv && conv.title === DEFAULT_CONVERSATION_TITLE) {
            api.conversations.update(convIdRef.current!, { title: msg.content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE })
          }
          invalidateConversations()
        })
        .catch(() => {})
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
      .catch(() => {})

    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ])
  }, [selectedModel, selectedApiKeyId, selectedProvider, ensureApiKey, saveUserMessage, send, messages])

  // ─── 其他操作 ───
  const handleStop = useCallback(() => { abort() }, [abort])

  const handleRegenerate = useCallback(async () => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return

    ensureApiKey()

    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, apiMessages)
    setMessages((prev) => prev.slice(0, -1))
  }, [selectedModel, selectedApiKeyId, selectedProvider, messages, ensureApiKey, send])

  const handleSelectConversation = useCallback(async (id: number) => {
    const result = await selectConversation(id)
    setMessages(result.messages)
    setSelectedProviderId(result.providerId)
    setSelectedModel(result.model)
    setSelectedApiKeyId(result.apiKeyId)
  }, [selectConversation])

  const handleNewConversation = useCallback(() => {
    abort()
    setMessages([])
    newConversation()
    setSelectedProviderId(null)
    setSelectedModel(null)
    setSelectedApiKeyId(null)
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
