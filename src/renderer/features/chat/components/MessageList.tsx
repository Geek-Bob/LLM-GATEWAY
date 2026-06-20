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
import { ChatMessage } from '@/features/chat/components/ChatMessage'

/** 单条消息的数据结构 */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  hasError?: boolean
}

interface MessageListProps {
  messages: Message[]
  onRegenerate: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

/** 消息列表区域，包含空态引导和消息渲染。 @returns 消息列表 JSX。 */
export function MessageList({ messages, onRegenerate, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-auto px-3 py-4">
      <AnimatePresence mode="popLayout">
        {messages.length === 0 ? (
          <motion.div
            key="empty"
            className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            选择模型和 API Key，输入消息开始测试
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
