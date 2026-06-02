/**
 * Chat 页面 — 多 LLM 供应商对话界面
 *
 * 数据流:
 * 1. useProviders / useApiKeys / useConversations 通过 IPC 获取供应商、密钥和会话列表
 * 2. 选择供应商/模型/API Key 后，输入消息触发 useChatStream（通过 HTTP 代理 8080 端口发送 SSE 流请求）
 * 3. 流式响应逐块更新 messages 状态，完成后异步保存到数据库
 * 4. 会话管理：新建/切换/删除会话均通过 IPC 操作数据库
 *
 * 路由：页面内工具栏（供应商/模型/Key 选择） + 对话列表 + 消息区域 + 输入框
 */

import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'

import { MessageSquare, Square } from 'lucide-react'
import { api } from '../lib/ipc'
import { setApiKey } from '../shared/lib/api-client'
import { useChatStream } from '../features/chat/hooks/useChatStream'
import type { StreamMessage } from '../features/chat/hooks/useChatStream'

import { useProviders } from '../lib/queries/providers'
import { useApiKeys } from '../lib/queries/apiKeys'
import { useConversations } from '../lib/queries/conversations'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'

/** 单条消息的数据结构，覆盖用户消息、助手流式响应和错误状态 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string       /** 模型的思考过程（如 Anthropic 的 extended thinking） */
  isThinking?: boolean    /** 模型正在思考中 */
  model?: string          /** 使用的模型名称 */
  isStreaming?: boolean   /** 是否正在接收流式响应 */
  error?: boolean         /** 本次请求是否出错 */
}

export function ChatPage() {
  const queryClient = useQueryClient()
  const { data: providers = [] } = useProviders()
  const { data: activeApiKeys = [] } = useApiKeys()
  const { data: conversations = [] } = useConversations()

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<number | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const availableModels = selectedProvider?.models ?? []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  const invalidateConversations = () => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  const ensureApiKey = async () => {
    if (!selectedApiKeyId) return
    try {
      const keys: Array<{ id: number; key_plaintext: string }> = await api.apiKeys.list()
      const match = keys.find((k) => k.id === selectedApiKeyId)
      if (match?.key_plaintext) {
        setApiKey(match.key_plaintext)
      }
    } catch {
      // 保留当前 key，不清空
    }
  }

  const handleStreamUpdate = (msg: StreamMessage) => {
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

    // Save assistant message to conversation when stream completes
    if (!msg.isStreaming && !msg.error && activeConversationId && msg.content) {
      api.conversations.addMessage(activeConversationId, 'assistant', msg.content, msg.thinking || '')
        .then(() => api.conversations.get(activeConversationId))
        .then((conv) => {
          if (conv && conv.title === '新对话') {
            api.conversations.update(activeConversationId!, { title: msg.content.slice(0, 30) || '新对话' })
          }
          invalidateConversations()
        })
        .catch(() => {})
    }
  }

  const { send, abort, isLoading: streamLoading } = useChatStream(handleStreamUpdate)

  const handleSend = async (content: string) => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    await ensureApiKey()

    // 先显示用户消息到 UI，再异步保存到数据库
    const userMessage: Message = { id: uuidv4(), role: 'user', content }
    setMessages((prev) => [...prev, userMessage])

    let convId = activeConversationId
    try {
      if (!convId) {
        const conv = await api.conversations.create({
          title: content.slice(0, 30) || '新对话',
          model: selectedModel,
          providerId: selectedProviderId,
          apiKeyId: selectedApiKeyId,
        })
        convId = conv.id
        setActiveConversationId(convId)
        invalidateConversations()
      }

      await api.conversations.update(convId, {
        model: selectedModel,
        providerId: selectedProviderId,
        apiKeyId: selectedApiKeyId,
      })

      await api.conversations.addMessage(convId, 'user', content)
    } catch (err) {
      console.error('[Chat] 保存消息失败:', err)
    }

    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content }
    ])
  }

  const handleStop = () => {
    abort()
  }

  const handleRegenerate = async () => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return

    await ensureApiKey()

    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, apiMessages)
    setMessages((prev) => prev.slice(0, -1))
  }

  const handleSelectConversation = async (id: number) => {
    setActiveConversationId(id)
    setMessages([])

    const msgs = await api.conversations.messages(id)
    setMessages(msgs.map((m: { role: string; content: string; thinking?: string }) => ({
      id: uuidv4(),
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinking: m.thinking || undefined,
      isThinking: false,
      isStreaming: false,
    })))

    const conv = await api.conversations.get(id)
    if (conv) {
      if (conv.provider_id) setSelectedProviderId(conv.provider_id)
      if (conv.model) setSelectedModel(conv.model)
      if (conv.api_key_id) setSelectedApiKeyId(conv.api_key_id)
    }
  }

  const handleNewConversation = () => {
    abort()
    setMessages([])
    setActiveConversationId(null)
    setSelectedProviderId(null)
    setSelectedModel(null)
    setSelectedApiKeyId(null)
    setInputKey(k => k + 1)
  }

  const handleDeleteConversation = async (id: number) => {
    const conv = conversations.find(c => c.id === id)
    if (!confirm(`确定删除"${conv?.title || '此会话'}"？`)) return
    await api.conversations.delete(id)
    if (activeConversationId === id) {
      setActiveConversationId(null)
      setMessages([])
    }
    invalidateConversations()
    setInputKey(k => k + 1)
  }

  const providerOptions = providers.filter((p) => p.isActive === 1)
  const keyOptions = activeApiKeys.filter((k) => k.is_active === 1)

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
        {/* Toolbar */}
        <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
          <Select
            value={selectedProviderId?.toString() ?? ''}
            onValueChange={(val) => {
              if (!val) { setSelectedProviderId(null); setSelectedModel(null); return }
              setSelectedProviderId(Number(val))
              setSelectedModel(null)
            }}
          >
            <SelectTrigger className="flex-1 min-w-[140px]">
              <SelectValue placeholder="选择供应商" />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedModel ?? ''}
            onValueChange={(val) => setSelectedModel(val || null)}
            disabled={!selectedProvider}
          >
            <SelectTrigger className="flex-1 min-w-[140px]">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedApiKeyId?.toString() ?? ''}
            onValueChange={(val) => {
              if (!val) { setSelectedApiKeyId(null); return }
              setSelectedApiKeyId(Number(val))
            }}
          >
            <SelectTrigger className="flex-1 min-w-[140px]">
              <SelectValue placeholder="选择 API Key" />
            </SelectTrigger>
            <SelectContent>
              {keyOptions.map((k) => (
                <SelectItem key={k.id} value={k.id.toString()}>{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

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
            <Button
              onClick={handleStop}
              variant="destructive"
              size="default"
              className="px-3 py-2.5"
            >
              <Square className="w-4 h-4" />
              停止
            </Button>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
