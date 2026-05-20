import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  error?: boolean
}

export function ChatMessage({ role, content, thinking, isThinking, model, isStreaming, error }: ChatMessageProps) {
  const isUser = role === 'user'
  const [thinkingExpanded, setThinkingExpanded] = useState(true)

  useEffect(() => {
    if (!isThinking && thinking) {
      setThinkingExpanded(false)
    }
  }, [isThinking, thinking])

  const bg = isUser
    ? 'rgba(59, 130, 246, 0.12)'
    : error
      ? 'rgba(239, 68, 68, 0.1)'
      : 'rgba(255, 255, 255, 0.03)'
  const border = isUser
    ? '1px solid rgba(59, 130, 246, 0.2)'
    : error
      ? '1px solid rgba(239, 68, 68, 0.2)'
      : '1px solid rgba(255, 255, 255, 0.06)'

  return (
    <motion.div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 px-1`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="max-w-[75%] rounded-2xl px-5 py-3.5" style={{ background: bg, border }}>
        {model && !isUser && (
          <p className="text-[11px] font-mono mb-1.5" style={{ color: '#475569' }}>{model}</p>
        )}

        {/* Thinking section (collapsible) */}
        {thinking && (
          <div
            className="mb-2 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-150"
            style={{ background: 'rgba(148, 163, 184, 0.06)', border: '1px solid rgba(148, 163, 184, 0.12)' }}
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
          >
            <p
              className="text-[11px] font-medium flex items-center gap-1.5"
              style={{ color: '#64748b' }}
            >
              <svg
                className="w-3 h-3 transition-transform duration-200"
                style={{ transform: thinkingExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              思考过程
              {(isThinking || isStreaming) && (
                <span className="inline-block w-1.5 h-1.5 rounded-full ml-1" style={{ background: '#60a5fa' }} />
              )}
            </p>
            {thinkingExpanded && (
              <motion.p
                className="text-xs leading-relaxed mt-1.5 whitespace-pre-wrap break-words"
                style={{ color: '#94a3b8' }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {thinking}
              </motion.p>
            )}
          </div>
        )}

        {/* Main content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words select-text" style={{ color: error ? '#f43f5e' : '#e2e8f0', userSelect: 'text' }}>
          {content}
          {isStreaming && !thinking && (
            <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom" style={{ background: '#60a5fa' }} />
          )}
        </p>
      </div>
    </motion.div>
  )
}
