/**
 * SSE (Server-Sent Events) 解析工具
 * 提取自 ipc/index.ts 的 tryExtract 逻辑，方便独立测试
 */

export interface SSELine {
  raw: string
  eventType?: string
  data?: string
}

/**
 * 从一行 SSE 文本中解析 event type 和 data
 */
export function parseSSELine(line: string): SSELine | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(':')) return null // comment

  let eventType: string | undefined
  let data: string | undefined

  if (trimmed.startsWith('event: ')) {
    eventType = trimmed.slice(7)
  } else if (trimmed.startsWith('data: ')) {
    data = trimmed.slice(6)
  } else if (trimmed.startsWith('data:') && trimmed.length > 6) {
    data = trimmed.slice(5)
  }

  if (data === undefined && eventType === undefined) return null
  return { raw: trimmed, eventType, data }
}

/**
 * 从 Anthropic SSE content_block_delta 事件中提取文本
 *
 * 支持的 delta 类型：
 * - text_delta: 标准 Anthropic 文本增量（实际回复）
 * - thinking_delta: deepseek 内部推理过程
 *
 * 返回 { text, chunkType } 以区分 thinking 和 text
 */
export function tryExtractText(obj: any): { text: string; chunkType: 'thinking' | 'text' } | null {
  if (obj?.type !== 'content_block_delta') return null
  const d = obj.delta
  if (!d) return null
  if (d.type === 'text_delta' && d.text) return { text: d.text, chunkType: 'text' }
  if (d.type === 'thinking_delta' && d.thinking) return { text: d.thinking, chunkType: 'thinking' }
  return null
}

/**
 * 从一行 SSE data JSON 中提取文本（Anthropic 格式）
 */
export function extractFromAnthropicSSE(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr)
    const result = tryExtractText(parsed)
    return result?.text ?? ''
  } catch {
    return ''
  }
}

/**
 * 从一行 SSE data JSON 中提取文本（OpenAI 格式）
 */
export function extractFromOpenaiSSE(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr)
    return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || ''
  } catch {
    return ''
  }
}

/**
 * 解析完整的 SSE 文本（多行），提取所有文本内容（Anthropic 格式）
 * 用于测试验证
 */
export function parseAnthropicSSE(sseText: string): string[] {
  const results: string[] = []
  for (const line of sseText.split('\n')) {
    const parsed = parseSSELine(line)
    if (parsed?.data) {
      const text = extractFromAnthropicSSE(parsed.data)
      if (text) results.push(text)
    }
  }
  return results
}

/**
 * 解析完整的 SSE 文本（多行），提取所有文本内容（OpenAI 格式）
 * 用于测试验证
 */
export function parseOpenaiSSE(sseText: string): string[] {
  const results: string[] = []
  for (const line of sseText.split('\n')) {
    const parsed = parseSSELine(line)
    if (parsed?.data) {
      if (parsed.data === '[DONE]') continue
      const text = extractFromOpenaiSSE(parsed.data)
      if (text) results.push(text)
    }
  }
  return results
}
