/**
 * ChatInputArea — 消息输入区域（底栏布局）
 *
 * 扁平化底栏：左侧为 ChatInput，停止/发送按钮由 ChatInput 内部按 isStreaming 切换。
 * 不再包裹 Card，改为顶部带边框的横条。
 *
 * props:
 * - inputKey: 变化时重置输入框（新建/切换会话时使用）
 * - isStreamLoading: 是否正在流式传输
 * - selectedModel: 当前选中模型（null 时禁用输入）
 * - selectedApiKeyId: 当前选中 API Key（null 时禁用输入）
 * - onSend: 发送消息回调
 * - onStop: 停止流式传输回调
 */

import { ChatInput } from '@/features/chat/components/ChatInput'

interface ChatInputAreaProps {
  inputKey: number
  isStreamLoading: boolean
  selectedModel: string | null
  selectedApiKeyId: number | null
  onSend: (content: string) => void
  onStop: () => void
}

/** 消息输入区域（底栏），包含 ChatInput（发送/停止按钮由 ChatInput 内部按 isStreaming 切换）。 @returns 输入区域 JSX。 */
export function ChatInputArea({
  inputKey,
  isStreamLoading,
  selectedModel,
  selectedApiKeyId,
  onSend,
  onStop,
}: ChatInputAreaProps) {
  return (
    <div className="flex items-end gap-2 px-3 py-2 border-t border-border/50">
      <div className="flex-1">
        <ChatInput
          key={inputKey}
          onSend={onSend}
          disabled={isStreamLoading || !selectedModel || !selectedApiKeyId}
          isStreaming={isStreamLoading}
          onStop={onStop}
        />
      </div>
    </div>
  )
}
