/**
 * 协议转换器共享类型定义
 */

/** 请求/响应格式方向 */
export type ProtocolFormat = 'openai' | 'anthropic'

const CLAUDE_TO_OPENAI: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
}

const OPENAI_TO_CLAUDE: Record<string, string> = {
  stop: 'end_turn',
  stop_sequence: 'stop_sequence',
  length: 'max_tokens',
  max_tokens: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
}

/**
 * 映射 finish_reason / stop_reason 在两个协议之间的命名差异。
 * OpenAI 的 finish_reason 和 Anthropic 的 stop_reason 表达相同含义但用词不同。
 * 无法映射的值原样返回（例如自定义 stop_sequence 名称）。
 *
 * @param reason - 源协议的停止原因字符串
 * @param direction - 转换方向
 * @returns 目标协议的停止原因字符串
 */
export function mapFinishReason(
  reason: string,
  direction: 'toOpenAI' | 'toAnthropic'
): string {
  if (!reason) return ''
  const map = direction === 'toOpenAI' ? CLAUDE_TO_OPENAI : OPENAI_TO_CLAUDE
  return map[reason.toLowerCase()] ?? reason
}

/**
 * OpenAI SSE → Anthropic SSE 状态机的内部状态
 *
 * 追踪当前打开的 content_block 类型和索引，
 * 以正确地将 OpenAI chunk 映射到 Anthropic 的事件序列。
 */
export interface StreamState {
  /** 当前正在打开的 content_block 类型（决定关闭行为和索引推进方式） */
  lastMessagesType: 'none' | 'text' | 'thinking' | 'tools'
  /** 当前 content_block 的全局索引（用于 content_block_start/stop 事件） */
  index: number
  /** tool_calls 组的起始索引（当切换到 tools 类型时记录） */
  toolCallBaseIndex: number
  /** 当前工具调用组中的最大数组偏移量（用于批量关闭） */
  toolCallMaxIndexOffset: number
  /** 流是否已终止（收到 finish_reason 后置 true） */
  done: boolean
  /** 缓存的 finish_reason（在收到 usage chunk 前暂存于此） */
  finishReason: string
  /** 模型名称（从首 chunk 提取） */
  model: string
  /** 消息 ID（从首 chunk 提取） */
  id: string
}

/**
 * SSE 流式转换上下文
 *
 * - state：StreamState 实例，由 openAISSEToAnthropic 修改
 * - sentMessageStart：使用 { current: boolean } 包装为可变引用对象，
 *   因为 convertSSEEvent 可能被多次调用，需要引用同一 mutable 状态。
 *   这是 JavaScript 中"用对象包装实现引用传递"的惯用模式。
 */
export interface StreamContext {
  state: StreamState
  sentMessageStart: { current: boolean }
}
