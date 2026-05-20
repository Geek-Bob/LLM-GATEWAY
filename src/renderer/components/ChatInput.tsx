import { useRef } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
        className="cyber-input flex-1 px-4 py-2.5 text-sm resize-none"
        style={{ maxHeight: 200, fontFamily: 'inherit' }}
      />
      <button
        onClick={handleSend}
        disabled={disabled}
        className="btn-cyber !px-4 !py-2.5 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        发送
      </button>
    </div>
  )
}
