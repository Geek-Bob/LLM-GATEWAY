/**
 * ChatInputArea — 消息输入区域
 *
 * 包含 ChatInput 组件和流式传输时的停止按钮。
 * 输入框和停止按钮共存于同一 Card 行内。
 *
 * props:
 * - inputKey: 变化时重置输入框（新建/切换会话时使用）
 * - streamLoading: 是否正在流式传输
 * - selectedModel: 当前选中模型（null 时禁用输入）
 * - selectedApiKeyId: 当前选中 API Key（null 时禁用输入）
 * - onSend: 发送消息回调
 * - onStop: 停止流式传输回调
 */

import { Square } from 'lucide-react'
import { ChatInput } from '@/features/chat/components/ChatInput'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ChatInputAreaProps {
  inputKey: number
  isStreamLoading: boolean
  selectedModel: string | null
  selectedApiKeyId: number | null
  onSend: (content: string) => void
  onStop: () => void
}

/** 消息输入区域，包含 ChatInput 和流式传输时的停止按钮。 @returns 输入区域 JSX。 */
export function ChatInputArea({
  inputKey,
  isStreamLoading,
  selectedModel,
  selectedApiKeyId,
  onSend,
  onStop,
}: ChatInputAreaProps) {
  return (
    <Card className="p-3 flex items-center gap-2 bg-background/50">
      <div className="flex-1">
        <ChatInput key={inputKey} onSend={onSend} disabled={isStreamLoading || !selectedModel || !selectedApiKeyId} />
      </div>
      {isStreamLoading && (
        <Button onClick={onStop} variant="destructive" size="default" className="px-3 py-2.5">
          <Square className="w-4 h-4" />
          停止
        </Button>
      )}
    </Card>
  )
}
