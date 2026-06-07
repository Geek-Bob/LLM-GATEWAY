/**
 * MessageList — 消息列表区域
 *
 * 包含两种状态:
 * 1. 空态: 显示引导卡片（选择模型和 API Key）
 * 2. 消息列表: 渲染 ChatMessage 组件，支持重新生成最后一条助手消息
 *
 * props:
 * - messages: 消息数组
 * - onRegenerate: 重新生成回调（仅对最后一条助手消息生效）
 * - messagesEndRef: 底部锚点 ref，用于自动滚动
 */

import { AnimatePresence, motion } from 'framer-motion'
import { MessageSquare } from 'lucide-react'
import { ChatMessage } from '@/features/chat/components/ChatMessage'
import { Card, CardContent } from '@/components/ui/card'

/** 单条消息的数据结构 */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  error?: boolean
}

interface MessageListProps {
  messages: Message[]
  onRegenerate: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

/** 消息列表区域，包含空态引导和消息渲染。 @returns 消息列表 JSX。 */
export function MessageList({ messages, onRegenerate, messagesEndRef }: MessageListProps) {
  return (
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
              <ChatMessage key={msg.id} {...msg} onRegenerate={isLastAssistant ? onRegenerate : undefined} />
            )
          })
        )}
      </AnimatePresence>
      <div ref={messagesEndRef} />
    </div>
  )
}
