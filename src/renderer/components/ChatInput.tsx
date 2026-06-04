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
import { Button } from './ui/button'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

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
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="输入消息... (Shift+Enter 换行)"
        rows={1}
        disabled={disabled}
        className="flex-1 min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        style={{ maxHeight: 200, fontFamily: 'inherit' }}
      />
      <Button onClick={handleSend} disabled={disabled} size="default" className="px-4 py-2.5">
        <Send className="w-4 h-4" />
        发送
      </Button>
    </div>
  )
}
