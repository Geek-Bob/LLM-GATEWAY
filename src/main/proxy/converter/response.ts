/**
 * 响应转换：OpenAI ↔ Anthropic 双向转换
 *
 * convertResponse() 作为公共入口，根据 from/to 方向分派到：
 * - anthropicToOpenAIResponse()：方向③
 * - openAIToAnthropicResponse()：方向④
 */

import type { ProtocolFormat } from './types'
import { mapFinishReason } from './types'

/**
 * Anthropic → OpenAI 响应转换（方向③）
 *
 * 将 Anthropic Messages 响应体转换为 OpenAI Chat Completions 格式。
 * 用于：客户端以 OpenAI 格式请求，上游是 Anthropic 供应商时，将 Anthropic 响应转回 OpenAI 格式。
 *
 * 转换要点：
 * - 错误响应：Anthropic { type: 'error', error: {...} } → OpenAI { error: {...} }
 * - 成功响应：
 *   - Anthropic 的 id/model/usage 直接映射
 *   - content_block 数组中的 text → choices[0].message.content
 *   - tool_use block → choices[0].message.tool_calls[]
 *   - thinking block → choices[0].message.reasoning_content
 *   - stop_reason → finish_reason（通过 mapFinishReason）
 *   - usage.input_tokens → prompt_tokens, usage.output_tokens → completion_tokens
 * - OpenAI 的 object 固定为 'chat.completion', created 使用当前时间戳
 *
 * @param anthropicBody - Anthropic 格式的响应体
 * @returns OpenAI 格式的响应体
 */
function anthropicToOpenAIResponse(
  anthropicBody: Record<string, any>
): Record<string, any> {
  // 兼容两种错误格式：
  // Anthropic 原生: {"type": "error", "error": {"message": "..."}}
  // OpenAI 格式（部分供应商如 DeepSeek 在 Anthropic 端点返回）: {"error": {"message": "..."}}
  if (anthropicBody.type === 'error' || anthropicBody.error) {
    const err = anthropicBody.error ?? {}
    return { error: { type: err.type ?? '', message: err.message ?? '', code: null } }
  }

  const response: Record<string, any> = {
    id: anthropicBody.id,
    object: 'chat.completion',
    model: anthropicBody.model,
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      message: { role: 'assistant', content: '' },
      finish_reason: mapFinishReason(anthropicBody.stop_reason ?? '', 'toOpenAI'),
    }],
    usage: {
      prompt_tokens: anthropicBody.usage?.input_tokens ?? 0,
      completion_tokens: anthropicBody.usage?.output_tokens ?? 0,
      total_tokens: (anthropicBody.usage?.input_tokens ?? 0) + (anthropicBody.usage?.output_tokens ?? 0),
    },
  }

  // Cache 字段映射：Anthropic 的 prompt cache 信息透传到 OpenAI 形态
  // - cache_read_input_tokens → OpenAI 标准 prompt_tokens_details.cached_tokens
  //   （使用 'in' 而非 '?? 0' 是为了避免在缺省时写入 { cached_tokens: 0 } 噪音字段）
  // - cache_creation_input_tokens 保留在顶层以便诊断，OpenAI 端不识别但无副作用
  if (typeof anthropicBody.usage?.cache_read_input_tokens === 'number') {
    response.usage.prompt_tokens_details = {
      cached_tokens: anthropicBody.usage.cache_read_input_tokens,
    }
  }
  if (typeof anthropicBody.usage?.cache_creation_input_tokens === 'number') {
    response.usage.cache_creation_input_tokens = anthropicBody.usage.cache_creation_input_tokens
  }

  const choice = response.choices[0]
  const toolCalls: Array<Record<string, any>> = []

  for (const block of anthropicBody.content ?? []) {
    switch (block.type) {
      case 'text':
        choice.message.content = block.text ?? ''
        break
      case 'tool_use':
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        })
        break
      case 'thinking':
        if (block.thinking) {
          choice.message.reasoning_content = block.thinking
        }
        break
    }
  }

  if (toolCalls.length > 0) {
    choice.message.tool_calls = toolCalls
    if (!choice.message.content) choice.message.content = null
  }

  return response
}

/**
 * OpenAI → Anthropic 响应转换（方向④）
 *
 * 将 OpenAI Chat Completions 响应体转换为 Anthropic Messages 格式。
 * 用于：客户端以 Anthropic 格式请求，上游是 OpenAI 供应商时，将 OpenAI 响应转回 Anthropic 格式。
 *
 * 转换要点：
 * - 错误响应：OpenAI { error: {...} } → Anthropic { type: 'error', error: {...} }
 * - 成功响应：
 *   - choices[0].message.content → Anthropic content 数组中的 text block
 *   - tool_calls → tool_use content_block
 *   - reasoning_content → thinking content_block
 *   - finish_reason → stop_reason（通过 mapFinishReason 反向映射）
 *   - usage.prompt_tokens → input_tokens, usage.completion_tokens → output_tokens
 * - 注意：转换后的 content 数组中 text/tool_use/thinking 的顺序和位置尽量保持，
 *   但 OpenAI 的原始响应中这些字段是平级的，而 Anthropic 将它们组合为 content 数组。
 *
 * @param openaiBody - OpenAI 格式的响应体
 * @returns Anthropic 格式的响应体
 */
function openAIToAnthropicResponse(
  openaiBody: Record<string, any>
): Record<string, any> {
  if (openaiBody.error && !openaiBody.choices) {
    const err = openaiBody.error
    return { type: 'error', error: { type: err.type ?? '', message: err.message ?? '' } }
  }

  const choice = openaiBody.choices?.[0] ?? {}
  const content: Array<Record<string, any>> = []

  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: any
      try {
        input = JSON.parse(tc.function?.arguments || '{}')
      } catch { input = tc.function?.arguments ?? {} }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function?.name ?? '',
        input,
      })
    }
  }
  if (choice.message?.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  if (choice.message?.reasoning_content) {
    content.push({ type: 'thinking', thinking: choice.message.reasoning_content })
  }

  return {
    id: openaiBody.id,
    type: 'message',
    role: 'assistant',
    model: openaiBody.model,
    content,
    stop_reason: mapFinishReason(choice.finish_reason ?? '', 'toAnthropic'),
    usage: {
      input_tokens: openaiBody.usage?.prompt_tokens ?? 0,
      output_tokens: openaiBody.usage?.completion_tokens ?? 0,
    },
  }
}

/**
 * 响应转换入口（公共 API）
 *
 * 将上游供应商的响应体从上游格式转换为客户端期望的格式。
 *
 * @param body - 上游返回的原始响应体
 * @param from - 上游供应商的协议格式
 * @param to - 客户端期望的协议格式
 * @returns 转换后的响应体
 * @throws 如果转换方向不被支持
 */
export function convertResponse(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): any {
  if (from === to) return body
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIResponse(body)
  if (from === 'openai' && to === 'anthropic') return openAIToAnthropicResponse(body)
  throw new Error(`Failed to convert response: unsupported conversion ${from} → ${to}`)
}
