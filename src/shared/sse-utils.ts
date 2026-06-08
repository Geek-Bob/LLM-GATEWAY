/**
 * 共享 SSE 解析工具
 *
 * 主进程和渲染进程都需要解析 SSE 行格式和提取 delta 内容，
 * 将核心逻辑放在 shared/ 层避免重复实现。
 */

/**
 * SSE 行解析结果
 * raw - 原始行文本
 * eventType - 事件类型（event: 字段）
 * data - 数据内容（data: 字段）
 */
export interface SSELine {
  raw: string
  eventType?: string
  data?: string
}

/**
 * 从一行 SSE 文本中解析 event type 和 data
 *
 * SSE 规范每行以 "field: value" 格式传输。
 * 空行和注释行（以冒号开头）直接跳过。
 * 兼容 data: 后跟单空格和无空格两种格式。
 */
export function parseSSELine(line: string): SSELine | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(':')) return null // comment

  let eventType: string | undefined
  let data: string | undefined

  if (trimmed.startsWith('event: ')) {
    eventType = trimmed.slice(7)
  } else if (trimmed.startsWith('event:') && trimmed.length > 6) {
    eventType = trimmed.slice(6)
  } else if (trimmed.startsWith('data: ')) {
    data = trimmed.slice(6)
  } else if (trimmed.startsWith('data:') && trimmed.length > 5) {
    data = trimmed.slice(5)
  }

  if (data === undefined && eventType === undefined) return null
  return { raw: trimmed, eventType, data }
}

/**
 * OpenAI SSE delta 提取结果
 */
export interface OpenAIDelta {
  content?: string
  reasoningContent?: string
}

/**
 * 从 OpenAI SSE data JSON 中提取 delta 内容
 *
 * 解析结构：{ choices: [{ delta: { content: "...", reasoning_content: "..." } }] }
 * 兼容非流式响应（choices[0].text）作为后备
 */
export function extractOpenAIDelta(jsonStr: string): OpenAIDelta | null {
  try {
    const parsed = JSON.parse(jsonStr)
    const delta = parsed.choices?.[0]?.delta
    if (!delta) return null
    return {
      content: delta.content || undefined,
      reasoningContent: delta.reasoning_content || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Anthropic SSE delta 提取结果
 */
export interface AnthropicDelta {
  text?: string
  thinking?: string
}

/**
 * 从 Anthropic SSE data JSON 中提取 delta 内容
 *
 * 解析结构：{ type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
 * 支持 text_delta 和 thinking_delta 两种类型
 */
export function extractAnthropicDelta(jsonStr: string): AnthropicDelta | null {
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.type !== 'content_block_delta') return null
    const d = parsed.delta
    if (!d) return null
    return {
      text: d.type === 'text_delta' ? d.text : undefined,
      thinking: d.type === 'thinking_delta' ? d.thinking : undefined,
    }
  } catch {
    return null
  }
}
