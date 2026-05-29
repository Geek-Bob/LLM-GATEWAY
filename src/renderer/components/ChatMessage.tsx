import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Markdown } from './ui/markdown'
import { ErrorBoundary } from './ErrorBoundary'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  error?: boolean
  onRegenerate?: () => void
}

export function ChatMessage({ role, content, thinking, isThinking, model, isStreaming, error, onRegenerate }: ChatMessageProps) {
  const isUser = role === 'user'
  const [thinkingExpanded, setThinkingExpanded] = useState(true)

  useEffect(() => {
    if (!isThinking && thinking) {
      setThinkingExpanded(false)
    }
  }, [isThinking, thinking])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      toast.success('已复制')
    } catch {
      toast.error('复制失败')
    }
  }

  const bubbleClass = isUser
    ? 'bg-primary/10 border-primary/20'
    : error
      ? 'bg-destructive/10 border-destructive/20 text-destructive'
      : 'bg-muted/30 border-border/50'

  const showActions = !isUser && !isStreaming && !error && content

  return (
    <motion.div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 px-1`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className={`max-w-[75%] rounded-2xl px-5 py-3.5 border ${bubbleClass}`}>
        {model && !isUser && (
          <p className="text-[11px] font-mono mb-1.5 text-muted-foreground">{model}</p>
        )}

        {/* Thinking section (collapsible) */}
        {thinking && (
          <div
            className="mb-2 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-150 bg-muted/50 border border-border/50"
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
          >
            <p className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
              <ChevronDown
                className="w-3 h-3 transition-transform duration-200"
                style={{ transform: thinkingExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
              思考过程
              {(isThinking || isStreaming) && (
                <span className="inline-block w-1.5 h-1.5 rounded-full ml-1 bg-primary" />
              )}
            </p>
            {thinkingExpanded && (
              <motion.p
                className="text-xs leading-relaxed mt-1.5 whitespace-pre-wrap break-words text-muted-foreground"
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
        {isUser ? (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words select-text ${error ? 'text-destructive' : 'text-foreground'}`}>
            {content}
            {isStreaming && !thinking && (
              <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-primary" />
            )}
          </p>
        ) : (
          <ErrorBoundary>
            <Markdown
              enableMermaid
              isStreaming={isStreaming}
              className={`text-sm ${error ? 'text-destructive' : 'text-foreground'}`}
            >
              {content}
            </Markdown>
          </ErrorBoundary>
        )}

        {isStreaming && !isUser && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-primary" />
        )}

        {/* Action buttons */}
        {showActions && (
          <div className="flex items-center gap-0.5 mt-3 pt-2 border-t border-border/30">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
              onClick={handleCopy}
            >
              <Copy className="w-3 h-3" />
              复制
            </button>
            {onRegenerate && (
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                onClick={onRegenerate}
              >
                <RefreshCw className="w-3 h-3" />
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
