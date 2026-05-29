import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'

import { MessageSquare, Square } from 'lucide-react'
import { api } from '../lib/ipc'

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

const debugLog = (...args: unknown[]) => {
  try { api.debug?.log(...args) } catch { /* ignore */ }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  error?: boolean
}

export function ChatPage() {
  const queryClient = useQueryClient()
  const { data: providers = [] } = useProviders()
  const { data: activeApiKeys = [] } = useApiKeys()
  const { data: conversations = [] } = useConversations()

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const currentConvIdRef = useRef<number | null>(null)
  const accumulatedContent = useRef('')
  const accumulatedThinking = useRef('')
  const [isLoading, setIsLoading] = useState(false)
  const currentRequestId = useRef<string | null>(null)
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

  const handleSend = async (content: string) => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    let convId = activeConversationId
    if (!convId) {
      convId = await api.conversations.create({
        title: content.slice(0, 30) || '新对话',
        model: selectedModel,
        providerId: selectedProviderId,
        apiKeyId: selectedApiKeyId,
      })
      setActiveConversationId(convId)
      invalidateConversations()
    }

    // Save user message
    await api.conversations.addMessage(convId, 'user', content)

    // Sync conversation's model/provider/key selections (user may have changed them)
    await api.conversations.update(convId, {
      model: selectedModel,
      providerId: selectedProviderId,
      apiKeyId: selectedApiKeyId,
    })

    // Reset accumulated refs in case previous stream was aborted mid-stream
    accumulatedContent.current = ''
    accumulatedThinking.current = ''
    currentConvIdRef.current = convId

    const requestId = uuidv4()
    currentRequestId.current = requestId

    const userMessage: Message = { role: 'user', content }
    const assistantMessage: Message = { role: 'assistant', content: '', thinking: '', isThinking: true, model: selectedModel, isStreaming: true }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setIsLoading(true)

    api.chat.send({
      requestId,
      apiKeyId: selectedApiKeyId,
      model: `${selectedProvider.name}/${selectedModel}`,
      messages: [{ role: 'user', content }],
      apiFormat: selectedProvider.providerType,
    })
  }

  const chunkCountRef = useRef(0)
  useEffect(() => {
    debugLog('[ChatPage] registering onChunk listener')
    const cleanup = api.chat.onChunk((data) => {
      debugLog('[ChatPage] onChunk received', { requestId: data.requestId?.slice(0, 8), currentId: currentRequestId.current?.slice(0, 8), textLen: data.text.length, done: data.done, error: !!data.error })

      if (data.requestId !== currentRequestId.current) {
        debugLog('[ChatPage] onChunk SKIPPED - requestId mismatch')
        return
      }

      // Update accumulated refs OUTSIDE setMessages to avoid StrictMode double-invocation
      if (data.chunkType === 'thinking') {
        accumulatedThinking.current += data.text
      } else if (!data.done && !data.error) {
        accumulatedContent.current += data.text
      }

      // Side effects outside state updater (StrictMode-safe)
      if (data.error || data.done) {
        setIsLoading(false)
        currentRequestId.current = null
      }

      // Save assistant message + update title outside setMessages (StrictMode-safe)
      if (data.done) {
        const convId = currentConvIdRef.current
        if (convId && (accumulatedContent.current || accumulatedThinking.current)) {
          api.conversations.addMessage(convId, 'assistant', accumulatedContent.current, accumulatedThinking.current || '')
            .then(() => {
              // Update title if still default
              api.conversations.get(convId).then(conv => {
                if (conv && conv.title === '新对话') {
                  api.conversations.update(convId, { title: accumulatedContent.current.slice(0, 30) || '新对话' })
                }
              })
              invalidateConversations()
            })
            .catch(() => {})
        }
        accumulatedContent.current = ''
        accumulatedThinking.current = ''
        currentConvIdRef.current = null
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role !== 'assistant') {
          debugLog('[ChatPage] onChunk SKIPPED - last is not assistant', { lastRole: last?.role, totalItems: prev.length })
          return prev
        }

        if (data.error) {
          debugLog('[ChatPage] onChunk ERROR', { error: data.error })
          return prev.with(-1, { ...last, content: data.error, isStreaming: false, isThinking: false, error: true })
        } else if (data.done) {
          debugLog('[ChatPage] onChunk DONE', { totalChars: (last.content || '').length + (last.thinking || '').length })
          return prev.with(-1, { ...last, isStreaming: false, isThinking: false })
        } else if (data.chunkType === 'thinking') {
          chunkCountRef.current++
          return prev.with(-1, { ...last, thinking: (last.thinking || '') + data.text })
        } else {
          // text chunk — first text chunk auto-collapses thinking
          chunkCountRef.current++
          return prev.with(-1, { ...last, isThinking: false, content: last.content + data.text })
        }
      })
    })

    return () => {
      debugLog('[ChatPage] cleanup onChunk listener')
      cleanup()
    }
  }, [])

  const handleStop = () => {
    if (currentRequestId.current) {
      api.chat.abort(currentRequestId.current)
      currentRequestId.current = null
      setIsLoading(false)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.isStreaming) {
          return prev.with(-1, { ...last, isStreaming: false })
        }
        return prev
      })
    }
  }

  const handleSelectConversation = async (id: number) => {
    setActiveConversationId(id)
    setMessages([])

    const msgs = await api.conversations.messages(id)
    setMessages(msgs.map(m => ({
      role: m.role,
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

  const handleNewConversation = async () => {
    if (!selectedModel || !selectedProviderId || !selectedApiKeyId) return
    const id = await api.conversations.create({
      title: '新对话',
      model: selectedModel,
      providerId: selectedProviderId,
      apiKeyId: selectedApiKeyId,
    })
    setActiveConversationId(id)
    setMessages([])
    invalidateConversations()
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
              const id = Number(val)
              setSelectedProviderId(id || null)
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
            onValueChange={(val) => setSelectedApiKeyId(Number(val) || null)}
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
              messages.map((msg, i) => (
                <ChatMessage key={i} {...msg} />
              ))
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <Card className="p-3 flex items-center gap-2 bg-background/50">
          <div className="flex-1">
            <ChatInput onSend={handleSend} disabled={isLoading || !selectedModel || !selectedApiKeyId} />
          </div>
          {isLoading && (
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
