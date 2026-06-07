/**
 * ChatInput — 聊天消息输入框
 *
 * 功能:
 * 1. 自动扩展高度的 textarea（最大 200px）
 * 2. Enter 发送，Shift+Enter 换行
 * 3. disabled 状态解除时自动聚焦输入框
 *
 * props:
 * - onSend: 发送回调，传入 trimmed 后的文本
 * - disabled: 流式请求中禁用输入
 */

import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'

/** 输入框最大高度（px），超过此值出现滚动条 */
const MAX_INPUT_HEIGHT_PX = 200

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

/** 聊天消息输入框，支持自动扩展高度、Enter 发送、Shift+Enter 换行。 @returns 输入框 JSX。 */
export function ChatInput({ onSend, disabled }: ChatInputProps) {
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
      <Button onClick={handleSend} disabled={disabled} size="default" className="px-4 py-2.5">
        <Send className="w-4 h-4" />
        发送
      </Button>
    </div>
  )
}
