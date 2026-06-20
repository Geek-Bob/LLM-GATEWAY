/**
 * ChatInput — 聊天消息输入框
 *
 * 功能:
 * 1. 自动扩展高度的 textarea（最大 200px）
 * 2. Enter 发送，Shift+Enter 换行
 * 3. disabled 状态解除时自动聚焦输入框
 * 4. 流式传输期间发送按钮切换为停止按钮（icon-only 方形）
 *
 * props:
 * - onSend: 发送回调，传入 trimmed 后的文本
 * - disabled: 流式请求中或缺 model/apiKey 时禁用输入
 * - isStreaming: 是否处于流式传输中（true 时右侧按钮变为停止）
 * - onStop: 停止流式传输回调（仅 isStreaming=true 时使用）
 */

import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Square } from 'lucide-react'

/** 输入框最大高度（px），超过此值出现滚动条 */
const MAX_INPUT_HEIGHT_PX = 200

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  /** 是否处于流式传输中；true 时右侧按钮变为停止按钮并触发 onStop */
  isStreaming?: boolean
  /** 停止流式传输回调（仅 isStreaming=true 时使用） */
  onStop?: () => void
}

/** 聊天消息输入框，支持自动扩展高度、Enter 发送、Shift+Enter 换行。 @returns 输入框 JSX。 */
export function ChatInput({ onSend, disabled, isStreaming = false, onStop }: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // disabled 解除时自动聚焦输入框，提升交互体验
  useEffect(() => {
    if (!disabled && inputRef.current) {
      const raf = requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [disabled])

  const handleSend = () => {
    const el = inputRef.current
    if (!el) return
    const trimmed = el.value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    el.value = ''
    el.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX) + 'px'
  }

  const handleActionClick = () => {
    if (isStreaming) {
      onStop?.()
      return
    }
    handleSend()
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="输入消息... (Shift+Enter 换行)"
        rows={1}
        disabled={disabled}
        className="flex-1 min-h-9 py-2.5 shadow-sm focus-visible:ring-1 max-h-[200px] resize-none"
      />
      <Button
        onClick={handleActionClick}
        disabled={disabled}
        size="icon"
        aria-label={isStreaming ? '停止' : '发送'}
        className={
          isStreaming
            ? 'h-9 w-9 shrink-0 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 active:scale-95 transition-all'
            : 'h-9 w-9 shrink-0 rounded-md bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all'
        }
      >
        {isStreaming ? <Square className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
      </Button>
    </div>
  )
}
