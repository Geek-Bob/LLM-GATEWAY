import type { ParsedSSELine } from '../../shared/types'

/**
 * SSE (Server-Sent Events) 解析工具
 * 提取自 ipc/index.ts 的 tryExtract 逻辑，方便独立测试
 */

export type { ParsedSSELine }

/**
 * SSE 行解析结果
 * raw - 原始行文本
 * eventType - 事件类型（event: 字段）
 * data - 数据内容（data: 字段）
 */
interface SSELine {
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
 * - text_delta: 标准 Anthropic 文本增量（实际回复内容）
 * - thinking_delta: deepseek 内部推理过程（Anthropic 流式协议兼容扩展）
 *
 * 返回 { text, chunkType } 以区分 thinking 推理文本和 text 回复文本
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
 * 从一行 SSE data 的 JSON 中提取文本（Anthropic 格式）
 * 解析结构：{ type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
 * 注意：Anthropic SSE 每次只发送一个 delta，不累积
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
 * 从一行 SSE data 的 JSON 中提取文本（OpenAI 格式）
 * 解析结构：{ choices: [{ delta: { content: "..." } }] }
 * 兼容非流式响应（choices[0].text）作为后备
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
 * 解析完整的 SSE 文本（多行），提取所有文本片段（Anthropic 格式）
 * 用于测试验证场景，逐行解析并收集所有非空文本块
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
 * 解析完整的 SSE 文本（多行），提取所有文本片段（OpenAI 格式）
 * 用于测试验证场景。
 * 注意：OpenAI SSE 以 data: [DONE] 标记流结束，需要跳过此标记行。
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
