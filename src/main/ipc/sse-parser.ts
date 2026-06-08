/**
 * SSE (Server-Sent Events) 解析工具
 *
 * 基于 shared/sse-utils.ts 的共享解析函数，
 * 提供主进程专用的批量解析和文本提取能力。
 */

import {
  parseSSELine,
  extractOpenAIDelta,
  extractAnthropicDelta,
  type SSELine,
} from '../../shared/sse-utils'

export type { SSELine }

/**
 * 从一行 SSE data 的 JSON 中提取文本（Anthropic 格式）
 */
export function extractFromAnthropicSSE(jsonStr: string): string {
  const delta = extractAnthropicDelta(jsonStr)
  return delta?.text ?? ''
}

/**
 * 从一行 SSE data 的 JSON 中提取文本（OpenAI 格式）
 */
export function extractFromOpenaiSSE(jsonStr: string): string {
  const delta = extractOpenAIDelta(jsonStr)
  return delta?.content ?? ''
}

/**
 * 从 Anthropic SSE content_block_delta 事件中提取文本
 *
 * 支持的 delta 类型：
 * - text_delta: 标准 Anthropic 文本增量
 * - thinking_delta: 推理过程
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
 * 解析完整的 SSE 文本（多行），提取所有文本片段（Anthropic 格式）
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
