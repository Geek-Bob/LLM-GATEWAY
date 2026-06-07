/**
 * 请求转换：OpenAI ↔ Anthropic 双向转换
 *
 * convertRequest() 作为公共入口，根据 from/to 方向分派到：
 * - openaiToAnthropicRequest()：方向①
 * - anthropicToOpenAIRequest()：方向②
 */

import type { ProtocolFormat } from './types'

/**
 * OpenAI 特有、Anthropic 不支持的请求字段黑名单。
 * 在转换时会从请求体中删除这些字段，避免 Anthropic API 报错。
 * 这些字段包含采样参数（frequency_penalty）、稳定性参数（seed）、
 * 日志概率（logprobs）等 OpenAI 独占功能。
 */
const OPENAI_INCOMPATIBLE_FIELDS = [
  'n', 'frequency_penalty', 'presence_penalty', 'seed',
  'logprobs', 'top_logprobs', 'logit_bias', 'stream_options',
]

/**
 * 映射 OpenAI tool_choice 到 Anthropic 格式
 *
 * OpenAI 的 tool_choice：'auto' | 'required' | 'none' | { type: 'function', function: { name } }
 * Anthropic 的 tool_choice：{ type: 'auto' } | { type: 'any' } | { type: 'none' } | { type: 'tool', name }
 *
 * 映射表：
 *   OpenAI 'auto'     → Anthropic { type: 'auto' }
 *   OpenAI 'required' → Anthropic { type: 'any' }（注意命名不同）
 *   OpenAI 'none'     → Anthropic { type: 'none' }
 *   OpenAI { function: { name } } → Anthropic { type: 'tool', name }
 *
 * 另外，parallel_tool_calls → disable_parallel_tool_use 需要反转语义：
 *   parallel_tool_calls=true → disable_parallel_tool_use=false（保持不变）
 *   parallel_tool_calls=false → disable_parallel_tool_use=true
 *
 * @param toolChoice - OpenAI 格式的 tool_choice
 * @param parallelToolCalls - OpenAI 的 parallel_tool_calls 参数（可选）
 * @returns Anthropic 格式的 tool_choice（或 undefined 表示不设置）
 */
function mapToolChoice(
  toolChoice: any,
  parallelToolCalls?: boolean
): Record<string, any> | undefined {
  let result: Record<string, any> | undefined

  if (typeof toolChoice === 'string') {
    const map: Record<string, string> = { auto: 'auto', required: 'any', none: 'none' }
    const type = map[toolChoice]
    if (type) result = { type }
  } else if (typeof toolChoice === 'object' && toolChoice?.function?.name) {
    result = { type: 'tool', name: toolChoice.function.name }
  }

  if (result && result.type !== 'none' && parallelToolCalls !== undefined) {
    result.disable_parallel_tool_use = !parallelToolCalls
  }

  return result
}

/**
 * OpenAI → Anthropic 请求转换（方向①）
 *
 * 将 OpenAI Chat Completions 请求体转换为 Anthropic Messages 格式。
 * 这是最复杂的转换函数之一，因为两种协议的消息模型差异很大。
 *
 * 关键转换点：
 * - 消息角色：OpenAI 的 system 消息提取为顶层 system 字段
 * - 角色交替：Anthropic 要求 user/assistant 严格交替，连续同角色消息需合并
 * - tool 消息：包装为 tool_result content_block，追加到前一条 user 消息的 content 数组中
 * - 工具调用：tool_calls → tool_use content_block
 * - 图片：data: URI → Anthropic image content_block（base64）
 * - Web search：web_search_options → web_search_20250305 tool
 * - 推理：reasoning_effort → thinking.enabled + budget_tokens
 * - JSON Schema：response_format.type=json_schema → json_schema tool
 *
 * @param openaiBody - 原始 OpenAI 格式请求体
 * @returns 转换后的请求体 + 目标路径 /v1/messages
 */
function openaiToAnthropicRequest(
  openaiBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic field passthrough
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (openaiBody[key] !== undefined) {
      result[key] = openaiBody[key]
    }
  }

  // max_tokens with default
  result.max_tokens = openaiBody.max_tokens ?? openaiBody.max_completion_tokens ?? 4096

  // Stop sequences
  if (openaiBody.stop) {
    result.stop_sequences = Array.isArray(openaiBody.stop)
      ? openaiBody.stop
      : [openaiBody.stop]
  }

  // Messages
  const rawMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string; name?: string; cache_control?: any }> =
    openaiBody.messages ?? []

  // Extract system messages
  const systemBlocks: Array<{ type: string; text?: string; cache_control?: any }> = []
  const nonSystemMessages: typeof rawMessages = []

  for (const msg of rawMessages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content) {
        systemBlocks.push({ type: 'text', text: content })
      }
    } else {
      nonSystemMessages.push(msg)
    }
  }

  // Merge consecutive same-role messages (Claude requires alternating roles)
  const mergedMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }> = []
  for (const msg of nonSystemMessages) {
    const prev = mergedMessages[mergedMessages.length - 1]
    if (
      prev &&
      prev.role === msg.role &&
      prev.role !== 'tool' &&
      typeof prev.content === 'string' &&
      typeof msg.content === 'string' &&
      !msg.tool_calls
    ) {
      prev.content = `${prev.content} ${msg.content}`
    } else {
      mergedMessages.push({ ...msg })
    }
  }

  // Convert to Claude message format
  const claudeMessages: Array<Record<string, any>> = []
  let isFirst = true

  for (const msg of mergedMessages) {
    // Ensure first message is user
    if (isFirst && msg.role !== 'user') {
      claudeMessages.push({ role: 'user', content: '...' })
    }
    isFirst = false

    if (msg.role === 'tool') {
      const prev = claudeMessages[claudeMessages.length - 1]
      const toolResultBlock: Record<string, any> = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id ?? '',
        content: msg.content,
      }
      if ((msg as any).cache_control) {
        toolResultBlock.cache_control = (msg as any).cache_control
      }
      if (prev && prev.role === 'user') {
        if (typeof prev.content === 'string') {
          prev.content = [
            { type: 'text', text: prev.content },
            toolResultBlock,
          ]
        } else if (Array.isArray(prev.content)) {
          prev.content.push(toolResultBlock)
        }
      } else {
        claudeMessages.push({
          role: 'user',
          content: [toolResultBlock],
        })
      }
    } else if (typeof msg.content === 'string' && !msg.tool_calls) {
      const text = msg.content || '...'
      claudeMessages.push({
        role: msg.role,
        content: text,
      })
    } else {
      // Complex content (arrays, images) or tool_calls
      const blocks: Array<Record<string, any>> = []
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            blocks.push({ type: 'text', text: part.text || '...' })
          } else if (part.type === 'image_url') {
            let source = part.image_url?.url ?? ''
            let mediaType = 'image/jpeg'
            if (source.startsWith('data:')) {
              const match = source.match(/^data:([^;]+);base64,(.+)$/)
              if (match) {
                mediaType = match[1]
                source = match[2]
              }
            }
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: source },
            })
          }
        }
      } else if (typeof msg.content === 'string') {
        blocks.push({ type: 'text', text: msg.content || '...' })
      }
      // tool_calls → tool_use blocks
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let inputObj: any = {}
          try { inputObj = JSON.parse(tc.function?.arguments || '{}') } catch { /* ignore */ }
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name ?? '',
            input: inputObj,
          })
        }
      }
      claudeMessages.push({ role: msg.role, content: blocks })
    }
  }

  result.messages = claudeMessages

  // System field
  if (systemBlocks.length > 0) {
    result.system = systemBlocks
  }

  // Tools
  if (openaiBody.tools) {
    result.tools = openaiBody.tools
      .filter((t: any) => t.type === 'function')
      .map((t: any) => {
        const params = t.function?.parameters ?? {}
        return {
          name: t.function?.name ?? '',
          description: t.function?.description ?? '',
          input_schema: {
            type: params.type ?? 'object',
            ...Object.fromEntries(
              Object.entries(params).filter(([k]) => k !== 'type')
            ),
          },
        }
      })
  }

  // Tool choice
  if (openaiBody.tool_choice !== undefined) {
    result.tool_choice = mapToolChoice(openaiBody.tool_choice, openaiBody.parallel_tool_calls)
  } else if (openaiBody.parallel_tool_calls !== undefined) {
    result.tool_choice = mapToolChoice('auto', openaiBody.parallel_tool_calls)
  }

  // Web search
  if (openaiBody.web_search_options) {
    const wso = openaiBody.web_search_options
    const maxUsesMap: Record<string, number> = { low: 1, medium: 5, high: 10 }
    const webSearchTool: Record<string, any> = {
      type: 'web_search_20250305',
      name: 'web_search',
    }
    if (wso.search_context_size) {
      webSearchTool.max_uses = maxUsesMap[wso.search_context_size] ?? 5
    }
    if (wso.user_location) {
      webSearchTool.user_location = { type: 'approximate', ...wso.user_location.approximate }
    }
    if (!result.tools) result.tools = []
    result.tools.push(webSearchTool)
  }

  // Reasoning effort → thinking
  if (openaiBody.reasoning_effort) {
    const budgetMap: Record<string, number> = { low: 1280, medium: 2048, high: 4096 }
    result.thinking = {
      type: 'enabled',
      budget_tokens: budgetMap[openaiBody.reasoning_effort] ?? 2048,
    }
  }

  // Response format
  if (openaiBody.response_format) {
    const rf = openaiBody.response_format
    if (rf.type === 'json_object') {
      const jsonHint = '\nYou must respond with valid JSON only. Do not wrap in markdown.'
      if (result.system) {
        const lastSys = result.system[result.system.length - 1]
        lastSys.text = (lastSys.text ?? '') + jsonHint
      } else {
        result.system = [{ type: 'text', text: jsonHint.trim() }]
      }
    } else if (rf.type === 'json_schema' && rf.json_schema) {
      const schema = rf.json_schema
      const jsonSchemaTool = {
        name: schema.name ?? 'json_output',
        description: schema.description ?? '',
        input_schema: schema.schema ?? {},
      }
      if (!result.tools) result.tools = []
      result.tools.push(jsonSchemaTool)
      result.tool_choice = { type: 'tool', name: schema.name }
    }
  }

  // Remove incompatible fields
  for (const field of OPENAI_INCOMPATIBLE_FIELDS) {
    delete result[field]
  }

  return { body: result, path: '/v1/messages' }
}

/**
 * Anthropic → OpenAI 请求转换（方向②）
 *
 * 将 Anthropic Messages 请求体转换为 OpenAI Chat Completions 格式。
 * 这是方向①的逆过程，但在消息重建方面有自己独特的复杂性。
 *
 * 关键转换点：
 * - 系统提示：Anthropic 顶层 system 字段 → OpenAI messages[0].role=system
 * - content_block 数组 → 展开为 OpenAI 的 content 字符串 + tool_calls 数组
 * - tool_use block → tool_calls 数组项（type: function）
 * - tool_result block → 分为独立的 role: tool 消息
 * - image block → data: URI 格式的 image_url content part
 * - thinking block → reasoning_content 字段
 * - Anthropic tools → OpenAI function calling 格式（name/description/parameters）
 * - Web search tool (type: web_search_20250305) → web_search_options
 * - thinking.enabled → reasoning_effort（budget_tokens → low/medium/high）
 * - tool_choice 反向映射（any→required, none→none, tool→function）
 * - disable_parallel_tool_use → parallel_tool_calls 反转
 *
 * @param anthropicBody - 原始 Anthropic 格式请求体
 * @returns 转换后的请求体 + 目标路径 /v1/chat/completions
 */
function anthropicToOpenAIRequest(
  anthropicBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic fields
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (anthropicBody[key] !== undefined) {
      result[key] = anthropicBody[key]
    }
  }
  if (anthropicBody.max_tokens !== undefined) {
    result.max_tokens = anthropicBody.max_tokens
  }

  // Stop sequences → stop
  if (anthropicBody.stop_sequences) {
    const seqs = anthropicBody.stop_sequences as string[]
    result.stop = seqs.length === 1 ? seqs[0] : seqs
  }

  // System → messages[0]
  const openaiMessages: Array<Record<string, any>> = []
  if (anthropicBody.system) {
    if (typeof anthropicBody.system === 'string') {
      if (anthropicBody.system) {
        openaiMessages.push({ role: 'system', content: anthropicBody.system })
      }
    } else if (Array.isArray(anthropicBody.system)) {
      const textParts = anthropicBody.system
        .filter((b: any) => b.type === 'text' && b.text)
        .map((b: any) => b.text)
      if (textParts.length > 0) {
        openaiMessages.push({ role: 'system', content: textParts.join('\n') })
      }
    }
  }

  // Convert messages
  for (const msg of anthropicBody.messages ?? []) {
    if (typeof msg.content === 'string') {
      openaiMessages.push({ role: msg.role, content: msg.content || '...' })
    } else if (Array.isArray(msg.content)) {
      const texts: string[] = []
      const toolCalls: Array<Record<string, any>> = []
      const mediaContents: Array<Record<string, any>> = []

      let thinkingText = ''
      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            texts.push(block.text ?? '')
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
          case 'tool_result':
            openaiMessages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            })
            break
          case 'image':
            if (block.source) {
              const mimeType = block.source.media_type ?? 'image/jpeg'
              const data = block.source.data ?? ''
              mediaContents.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` },
              })
            }
            break
          case 'thinking':
            if (block.thinking) {
              thinkingText = thinkingText ? `${thinkingText}\n${block.thinking}` : block.thinking
            }
            break
        }
      }

      const hasContent = toolCalls.length > 0 || texts.length > 0 || mediaContents.length > 0
      if (!hasContent && !thinkingText) continue

      if (toolCalls.length > 0) {
        const assistantMsg: Record<string, any> = { role: msg.role, content: null }
        if (texts.length > 0) {
          assistantMsg.content = texts.join(' ')
        }
        if (thinkingText) {
          assistantMsg.reasoning_content = thinkingText
        }
        assistantMsg.tool_calls = toolCalls
        openaiMessages.push(assistantMsg)
      } else if (mediaContents.length > 0) {
        const allContent = [
          ...texts.map((t: string) => ({ type: 'text', text: t })),
          ...mediaContents,
        ]
        const mediaMsg: Record<string, any> = { role: msg.role, content: allContent }
        if (thinkingText) {
          mediaMsg.reasoning_content = thinkingText
        }
        openaiMessages.push(mediaMsg)
      } else if (texts.length > 0 || thinkingText) {
        const textMsg: Record<string, any> = { role: msg.role }
        textMsg.content = texts.length > 0 ? texts.join(' ') : ''
        if (thinkingText) {
          textMsg.reasoning_content = thinkingText
        }
        openaiMessages.push(textMsg)
      }
    }
  }

  result.messages = openaiMessages

  // Tools
  if (anthropicBody.tools) {
    const webSearchTools: Array<Record<string, any>> = []
    const regularTools = anthropicBody.tools.filter((t: any) => {
      if (t.type === 'web_search_20250305') {
        webSearchTools.push(t)
        return false
      }
      return true
    })
    if (regularTools.length > 0) {
      result.tools = regularTools.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      }))
    }
    // Web search
    if (webSearchTools.length > 0) {
      const ws = webSearchTools[0]
      const contextMap: Record<number, string> = { 1: 'low', 5: 'medium', 10: 'high' }
      result.web_search_options = {}
      if (ws.max_uses) {
        result.web_search_options.search_context_size = contextMap[ws.max_uses] ?? 'medium'
      }
      if (ws.user_location) {
        result.web_search_options.user_location = { approximate: ws.user_location }
      }
    }
  }

  // Thinking → reasoning_effort
  if (anthropicBody.thinking) {
    const thinking = anthropicBody.thinking
    if (thinking.type === 'enabled') {
      const bt = thinking.budget_tokens ?? 2048
      if (bt <= 1280) result.reasoning_effort = 'low'
      else if (bt <= 2048) result.reasoning_effort = 'medium'
      else result.reasoning_effort = 'high'
    }
  }

  // Tool choice reverse mapping
  if (anthropicBody.tool_choice) {
    const tc = anthropicBody.tool_choice
    const typeMap: Record<string, string> = { auto: 'auto', any: 'required', none: 'none' }
    if (tc.type === 'tool') {
      result.tool_choice = { type: 'function', function: { name: tc.name } }
    } else if (typeMap[tc.type]) {
      result.tool_choice = typeMap[tc.type]
    }
    if (tc.disable_parallel_tool_use !== undefined) {
      result.parallel_tool_calls = !tc.disable_parallel_tool_use
    }
  }

  return { body: result, path: '/v1/chat/completions' }
}

/**
 * 请求转换入口（公共 API）
 *
 * 根据源和目标协议格式分派到具体的转换函数。
 * 如果 from === to（不需要转换），直接返回原始请求体并设置默认路径。
 *
 * @param body - 原始请求体
 * @param from - 源协议格式
 * @param to - 目标协议格式
 * @returns 转换后的请求体 + API 路径（OpenAI→/v1/chat/completions, Anthropic→/v1/messages）
 * @throws 如果转换方向不被支持（目前仅支持 OpenAI ↔ Anthropic 双向转换）
 */
export function convertRequest(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { body: any; path: string } {
  if (from === to) return { body, path: from === 'openai' ? '/v1/chat/completions' : '/v1/messages' }
  if (from === 'openai' && to === 'anthropic') return openaiToAnthropicRequest(body)
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIRequest(body)
  throw new Error(`Failed to convert request: unsupported conversion ${from} → ${to}`)
}
