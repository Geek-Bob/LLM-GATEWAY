/**
 * Chat 页面 — 多 LLM 供应商对话界面
 *
 * 数据流:
 * 1. useProviders / useApiKeys 通过 IPC 获取供应商和密钥列表
 * 2. 选择供应商/模型/API Key 后，输入消息触发 useChatStream（HTTP SSE）
 * 3. 流式响应逐块更新 messages 状态，完成后异步保存到数据库
 * 4. useConversationManager 封装所有会话 CRUD
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Square } from 'lucide-react'

import { api } from '../lib/ipc'
import { setApiKey } from '../shared/lib/api-client'
import { useChatStream } from '../features/chat/hooks/useChatStream'
import {
  useConversationManager,
  DEFAULT_CONVERSATION_TITLE,
} from '../features/chat/hooks/useConversationManager'
import type { StreamMessage } from '../features/chat/hooks/useChatStream'

import { useProviders } from '../lib/queries/providers'
import { useApiKeys } from '../lib/queries/apiKeys'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { ChatToolbar } from '../features/chat/components/ChatToolbar'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'

/** 单条消息的数据结构 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string       /** 模型的思考过程（如 extended thinking） */
  isThinking?: boolean    /** 模型正在思考中 */
  model?: string          /** 使用的模型名称 */
  isStreaming?: boolean   /** 是否正在接收流式响应 */
  error?: boolean         /** 本次请求是否出错 */
}

export function ChatPage() {
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

  // ─── API Key 管理 (修复 #1: 直接用内存数据) ───
  const ensureApiKey = useCallback(() => {
    const match = activeApiKeys.find((k) => k.id === selectedApiKeyId)
    if (match?.key_plaintext) setApiKey(match.key_plaintext)
  }, [activeApiKeys, selectedApiKeyId])

  // ─── SSE 流回调 (修复 #3: convIdRef 避免闭包陷阱) ───
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

  // ─── 发送消息 (修复 #2 + #4: fire-and-forget 保存) ───
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

  // 修复 #5: 先加载消息再一次性设值, 消除空白闪烁
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

  // ─── JSX ───
  return (
    <motion.div
      className="flex h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 pl-3">
        <ChatToolbar
          providers={providerOptions}
          selectedProviderId={selectedProviderId}
          onSelectProvider={(id) => { setSelectedProviderId(id); if (id === null) setSelectedModel(null) }}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          apiKeys={keyOptions}
          selectedApiKeyId={selectedApiKeyId}
          onSelectApiKey={setSelectedApiKeyId}
        />

        {/* Messages */}
        <div className="flex-1 overflow-auto mb-4 px-1">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card className="p-8 text-center max-w-sm">
                  <CardContent className="flex flex-col items-center pt-6">
                    <MessageSquare className="w-10 h-10 mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">选择模型和 API Key</p>
                    <p className="text-xs mt-1 text-muted-foreground/60">输入消息开始测试模型可用性</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              messages.map((msg) => {
                const isLastAssistant = msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant' && !msg.isStreaming
                return (
                  <ChatMessage key={msg.id} {...msg} onRegenerate={isLastAssistant ? handleRegenerate : undefined} />
                )
              })
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <Card className="p-3 flex items-center gap-2 bg-background/50">
          <div className="flex-1">
            <ChatInput key={inputKey} onSend={handleSend} disabled={streamLoading || !selectedModel || !selectedApiKeyId} />
          </div>
          {streamLoading && (
            <Button onClick={handleStop} variant="destructive" size="default" className="px-3 py-2.5">
              <Square className="w-4 h-4" />
              停止
            </Button>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
