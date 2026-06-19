/**
 * 请求转换：OpenAI ↔ Anthropic 双向转换
 *
 * convertRequest() 作为公共入口，根据 from/to 方向分派到：
 * - openaiToAnthropicRequest()：方向①
 * - anthropicToOpenAIRequest()：方向②
 */

import type { ProtocolFormat } from './types'

/** OpenAI → Anthropic 转换时，未指定 max_tokens 时的默认值 */
const DEFAULT_MAX_TOKENS = 4096

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

// ──────────────────────────────────────────────
// OpenAI → Anthropic 方向：辅助函数
// ──────────────────────────────────────────────

/**
 * 从 OpenAI 消息数组中提取 system 消息块，返回 system 块和非 system 消息。
 * @param messages - 原始 OpenAI 消息数组
 * @returns systemBlocks 和 nonSystemMessages 的分离结果
 */
function extractSystemBlocks(
  messages: Array<{ role: string; content: any }>
): {
  systemBlocks: Array<{ type: string; text?: string; cache_control?: any }>
  nonSystemMessages: Array<{ role: string; content: any }>
} {
  const systemBlocks: Array<{ type: string; text?: string; cache_control?: any }> = []
  const nonSystemMessages: Array<{ role: string; content: any }> = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content) systemBlocks.push({ type: 'text', text: content })
    } else {
      nonSystemMessages.push(msg)
    }
  }
  return { systemBlocks, nonSystemMessages }
}

/**
 * 合并连续同角色消息（Anthropic 要求 user/assistant 严格交替）。
 * 仅合并两个连续的纯文本消息，跳过 tool 角色和含 tool_calls 的消息。
 * @param messages - 非 system 消息数组
 * @returns 合并后的消息数组
 */
function mergeConsecutiveMessages(
  messages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }>
): typeof messages {
  const merged: typeof messages = []
  for (const msg of messages) {
    const prev = merged[merged.length - 1]
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
      merged.push({ ...msg })
    }
  }
  return merged
}

/** 解析 data: URI，提取 mediaType 和 base64 数据。 */
function parseImageDataUrl(url: string): { source: string; mediaType: string } {
  let source = url
  let mediaType = 'image/jpeg'
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      mediaType = match[1]
      source = match[2]
    }
  }
  return { source, mediaType }
}

/** 将 OpenAI content parts 数组（text/image_url）转换为 Claude content blocks。 */
function convertContentParts(parts: any[]): Array<Record<string, any>> {
  const blocks: Array<Record<string, any>> = []
  for (const part of parts) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text || '...' })
    } else if (part.type === 'image_url') {
      const { source, mediaType } = parseImageDataUrl(part.image_url?.url ?? '')
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: source },
      })
    }
  }
  return blocks
}

/** 将 OpenAI tool_calls 数组转换为 Claude tool_use content blocks。 */
function convertToolCalls(toolCalls: any[]): Array<Record<string, any>> {
  return toolCalls.map(tc => {
    let inputObj: any = {}
    try { inputObj = JSON.parse(tc.function?.arguments || '{}') } catch { /* ignore */ }
    return {
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name ?? '',
      input: inputObj,
    }
  })
}

/** 将 OpenAI 消息的复杂内容转换为 Claude content blocks。 */
function buildContentBlocks(msg: { content: any; tool_calls?: any[] }): Array<Record<string, any>> {
  const blocks: Array<Record<string, any>> = []
  if (Array.isArray(msg.content)) {
    blocks.push(...convertContentParts(msg.content))
  } else if (typeof msg.content === 'string') {
    blocks.push({ type: 'text', text: msg.content || '...' })
  }
  if (msg.tool_calls) {
    blocks.push(...convertToolCalls(msg.tool_calls))
  }
  return blocks
}

/**
 * 将 tool 消息作为 tool_result 追加到前一条 user 消息的 content 中。
 * 如果前一条不是 user 消息，则创建新的 user 消息包裹 tool_result。
 * @param msg - tool 角色的消息
 * @param claudeMessages - 已转换的 Claude 消息数组（会被就地修改）
 */
function appendToolResult(
  msg: { role: string; tool_call_id?: string; content: any },
  claudeMessages: Array<Record<string, any>>
): void {
  const toolResultBlock: Record<string, any> = {
    type: 'tool_result',
    tool_use_id: msg.tool_call_id ?? '',
    content: msg.content,
  }
  if ((msg as any).cache_control) {
    toolResultBlock.cache_control = (msg as any).cache_control
  }
  const prev = claudeMessages[claudeMessages.length - 1]
  if (prev && prev.role === 'user') {
    if (typeof prev.content === 'string') {
      prev.content = [{ type: 'text', text: prev.content }, toolResultBlock]
    } else if (Array.isArray(prev.content)) {
      prev.content.push(toolResultBlock)
    }
  } else {
    claudeMessages.push({ role: 'user', content: [toolResultBlock] })
  }
}

/**
 * 将 OpenAI 消息数组完整转换为 Anthropic 格式。
 * 内部依次执行：提取 system → 合并同角色 → 逐条转换。
 * @param rawMessages - 原始 OpenAI 消息数组
 * @returns systemBlocks（顶层 system 字段）和 claudeMessages（消息数组）
 */
function convertMessages(
  rawMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string; name?: string; cache_control?: any }>
): {
  systemBlocks: Array<{ type: string; text?: string; cache_control?: any }>
  claudeMessages: Array<Record<string, any>>
} {
  const { systemBlocks, nonSystemMessages } = extractSystemBlocks(rawMessages)
  const merged = mergeConsecutiveMessages(nonSystemMessages)
  const claudeMessages: Array<Record<string, any>> = []
  let isFirst = true

  for (const msg of merged) {
    if (isFirst && msg.role !== 'user') {
      claudeMessages.push({ role: 'user', content: '...' })
    }
    isFirst = false

    if (msg.role === 'tool') {
      appendToolResult(msg, claudeMessages)
    } else if (typeof msg.content === 'string' && !msg.tool_calls) {
      claudeMessages.push({ role: msg.role, content: msg.content || '...' })
    } else {
      claudeMessages.push({ role: msg.role, content: buildContentBlocks(msg) })
    }
  }

  return { systemBlocks, claudeMessages }
}

/**
 * 将 OpenAI 工具定义转换为 Anthropic 格式。
 * 仅保留 type=function 的工具，映射 parameters → input_schema。
 * @param tools - OpenAI tools 数组
 * @returns Anthropic 格式的工具定义数组
 */
function convertTools(tools: any[]): Array<Record<string, any>> {
  return tools
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

/**
 * 将 OpenAI web_search_options 转换为 Anthropic web_search tool 并追加到 result.tools。
 * @param result - 正在构建的 Anthropic 请求体（会被就地修改）
 * @param webSearchOptions - OpenAI 的 web_search_options 对象
 */
function applyWebSearch(result: Record<string, any>, webSearchOptions: any): void {
  const maxUsesMap: Record<string, number> = { low: 1, medium: 5, high: 10 }
  const webSearchTool: Record<string, any> = {
    type: 'web_search_20250305',
    name: 'web_search',
  }
  if (webSearchOptions.search_context_size) {
    webSearchTool.max_uses = maxUsesMap[webSearchOptions.search_context_size] ?? 5
  }
  if (webSearchOptions.user_location) {
    webSearchTool.user_location = { type: 'approximate', ...webSearchOptions.user_location.approximate }
  }
  if (!result.tools) result.tools = []
  result.tools.push(webSearchTool)
}

/**
 * 将 OpenAI response_format 转换为 Anthropic 等效处理。
 * json_object → 追加 system 提示；json_schema → 注入 schema 工具并强制调用。
 * @param result - 正在构建的 Anthropic 请求体（会被就地修改）
 * @param responseFormat - OpenAI 的 response_format 对象
 */
function applyResponseFormat(result: Record<string, any>, responseFormat: any): void {
  if (responseFormat.type === 'json_object') {
    const jsonHint = '\nYou must respond with valid JSON only. Do not wrap in markdown.'
    if (result.system) {
      const lastSys = result.system[result.system.length - 1]
      lastSys.text = (lastSys.text ?? '') + jsonHint
    } else {
      result.system = [{ type: 'text', text: jsonHint.trim() }]
    }
  } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema) {
    const schema = responseFormat.json_schema
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

/** OpenAI → Anthropic 请求转换（方向①），委托 convertMessages / convertTools 等辅助函数。 */
function openaiToAnthropicRequest(
  openaiBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic field passthrough
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (openaiBody[key] !== undefined) result[key] = openaiBody[key]
  }
  result.max_tokens = openaiBody.max_tokens ?? openaiBody.max_completion_tokens ?? DEFAULT_MAX_TOKENS

  // Stop sequences
  if (openaiBody.stop) {
    result.stop_sequences = Array.isArray(openaiBody.stop) ? openaiBody.stop : [openaiBody.stop]
  }

  // Messages
  const { systemBlocks, claudeMessages } = convertMessages(openaiBody.messages ?? [])
  result.messages = claudeMessages
  if (systemBlocks.length > 0) result.system = systemBlocks

  // Tools
  if (openaiBody.tools) result.tools = convertTools(openaiBody.tools)

  // Tool choice
  if (openaiBody.tool_choice !== undefined) {
    result.tool_choice = mapToolChoice(openaiBody.tool_choice, openaiBody.parallel_tool_calls)
  } else if (openaiBody.parallel_tool_calls !== undefined) {
    result.tool_choice = mapToolChoice('auto', openaiBody.parallel_tool_calls)
  }

  // Web search / Reasoning / Response format
  if (openaiBody.web_search_options) applyWebSearch(result, openaiBody.web_search_options)
  // 思考参数：thinking 同结构透传，reasoning_effort → output_config.effort 字段名转换。
  // 两维度正交独立处理，代理是纯透传服务，不再生成 budget_tokens。
  if (openaiBody.thinking) result.thinking = openaiBody.thinking
  if (openaiBody.reasoning_effort) result.output_config = { effort: openaiBody.reasoning_effort }
  if (openaiBody.response_format) applyResponseFormat(result, openaiBody.response_format)

  // Remove incompatible fields
  for (const field of OPENAI_INCOMPATIBLE_FIELDS) delete result[field]

  return { body: result, path: '/v1/messages' }
}

// ──────────────────────────────────────────────
// Anthropic → OpenAI 方向：辅助函数
// ──────────────────────────────────────────────

/**
 * 将 Anthropic system 字段转换为 OpenAI system 消息。
 * 支持字符串和 content_block 数组两种格式。
 * @param system - Anthropic 的 system 字段（字符串或 block 数组）
 * @returns OpenAI 格式的 system 消息，或 null（无 system 内容时）
 */
function extractSystemMessage(
  system: string | Array<{ type: string; text?: string }> | undefined
): Record<string, any> | null {
  if (!system) return null
  if (typeof system === 'string') {
    return system ? { role: 'system', content: system } : null
  }
  if (Array.isArray(system)) {
    const textParts = system
      .filter((b: any) => b.type === 'text' && b.text)
      .map((b: any) => b.text)
    return textParts.length > 0 ? { role: 'system', content: textParts.join('\n') } : null
  }
  return null
}

/** 将 Anthropic image block 转换为 OpenAI image_url content part。 */
function parseImageBlock(block: any): Record<string, any> {
  const mimeType = block.source?.media_type ?? 'image/jpeg'
  const data = block.source?.data ?? ''
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${data}` },
  }
}

/** 解析 Anthropic content blocks，分类为文本、tool_calls、媒体和 thinking。 */
function parseContentBlocks(blocks: any[]): {
  texts: string[]
  toolCalls: Array<Record<string, any>>
  mediaContents: Array<Record<string, any>>
  thinkingText: string
} {
  const texts: string[] = []
  const toolCalls: Array<Record<string, any>> = []
  const mediaContents: Array<Record<string, any>> = []
  let thinkingText = ''

  for (const block of blocks) {
    if (block.type === 'text') {
      texts.push(block.text ?? '')
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      })
    } else if (block.type === 'image' && block.source) {
      mediaContents.push(parseImageBlock(block))
    } else if (block.type === 'thinking' && block.thinking) {
      thinkingText = thinkingText ? `${thinkingText}\n${block.thinking}` : block.thinking
    }
  }

  return { texts, toolCalls, mediaContents, thinkingText }
}

/**
 * 根据解析后的内容块构建 OpenAI 消息数组。
 * 根据内容类型选择不同的消息结构（纯文本 / 带图片 / 带 tool_calls）。
 * @param role - 消息角色
 * @param parsed - parseContentBlocks 的返回结果
 * @returns OpenAI 格式的消息数组（可能为空）
 */
function buildOpenAIMessage(
  role: string,
  parsed: { texts: string[]; toolCalls: any[]; mediaContents: any[]; thinkingText: string }
): Array<Record<string, any>> {
  const { texts, toolCalls, mediaContents, thinkingText } = parsed
  const hasContent = toolCalls.length > 0 || texts.length > 0 || mediaContents.length > 0
  if (!hasContent && !thinkingText) return []

  if (toolCalls.length > 0) {
    const msg: Record<string, any> = { role, content: texts.length > 0 ? texts.join(' ') : null }
    if (thinkingText) msg.reasoning_content = thinkingText
    msg.tool_calls = toolCalls
    return [msg]
  }

  if (mediaContents.length > 0) {
    const allContent = [
      ...texts.map((t: string) => ({ type: 'text', text: t })),
      ...mediaContents,
    ]
    const msg: Record<string, any> = { role, content: allContent }
    if (thinkingText) msg.reasoning_content = thinkingText
    return [msg]
  }

  const msg: Record<string, any> = { role }
  msg.content = texts.length > 0 ? texts.join(' ') : ''
  if (thinkingText) msg.reasoning_content = thinkingText
  return [msg]
}

/** 从 Anthropic content blocks 中提取 tool_result，转为独立的 OpenAI role=tool 消息。 */
function extractToolResults(content: any[]): Array<Record<string, any>> {
  return content
    .filter((b: any) => b.type === 'tool_result')
    .map((b: any) => ({
      role: 'tool',
      tool_call_id: b.tool_use_id,
      content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
    }))
}

/** 将 Anthropic 消息数组转换为 OpenAI 格式。 */
function convertAnthropicMessages(
  messages: Array<Record<string, any>>
): Array<Record<string, any>> {
  const openaiMessages: Array<Record<string, any>> = []

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      openaiMessages.push({ role: msg.role, content: msg.content || '...' })
      continue
    }
    if (!Array.isArray(msg.content)) continue

    openaiMessages.push(...extractToolResults(msg.content))

    const remaining = msg.content.filter((b: any) => b.type !== 'tool_result')
    const parsed = parseContentBlocks(remaining)
    openaiMessages.push(...buildOpenAIMessage(msg.role, parsed))
  }

  return openaiMessages
}

/**
 * 将 Anthropic 工具定义转换为 OpenAI 格式，同时提取 web_search 工具为 web_search_options。
 * @param tools - Anthropic tools 数组
 * @returns openaiTools（OpenAI function calling 格式）和 webSearchOptions（web_search 配置）
 */
function convertAnthropicTools(tools: any[]): {
  openaiTools: Array<Record<string, any>> | null
  webSearchOptions: Record<string, any> | null
} {
  const webSearchTools: Array<Record<string, any>> = []
  const regularTools = tools.filter((t: any) => {
    if (t.type === 'web_search_20250305') {
      webSearchTools.push(t)
      return false
    }
    return true
  })

  const openaiTools = regularTools.length > 0
    ? regularTools.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      }))
    : null

  let webSearchOptions: Record<string, any> | null = null
  if (webSearchTools.length > 0) {
    const ws = webSearchTools[0]
    const contextMap: Record<number, string> = { 1: 'low', 5: 'medium', 10: 'high' }
    webSearchOptions = {}
    if (ws.max_uses) {
      webSearchOptions.search_context_size = contextMap[ws.max_uses] ?? 'medium'
    }
    if (ws.user_location) {
      webSearchOptions.user_location = { approximate: ws.user_location }
    }
  }

  return { openaiTools, webSearchOptions }
}

/** Anthropic → OpenAI 请求转换（方向②），委托 convertAnthropicMessages / convertAnthropicTools 等辅助函数。 */
function anthropicToOpenAIRequest(
  anthropicBody: Record<string, any>
): { body: Record<string, any>; path: string } {
  const result: Record<string, any> = {}

  // Basic fields
  for (const key of ['model', 'temperature', 'top_p', 'top_k', 'stream', 'service_tier']) {
    if (anthropicBody[key] !== undefined) result[key] = anthropicBody[key]
  }
  if (anthropicBody.max_tokens !== undefined) result.max_tokens = anthropicBody.max_tokens

  // Stop sequences
  if (anthropicBody.stop_sequences) {
    const seqs = anthropicBody.stop_sequences as string[]
    result.stop = seqs.length === 1 ? seqs[0] : seqs
  }

  // System + Messages
  const systemMsg = extractSystemMessage(anthropicBody.system)
  const convertedMessages = convertAnthropicMessages(anthropicBody.messages ?? [])
  result.messages = systemMsg ? [systemMsg, ...convertedMessages] : convertedMessages

  // Tools
  if (anthropicBody.tools) {
    const { openaiTools, webSearchOptions } = convertAnthropicTools(anthropicBody.tools)
    if (openaiTools) result.tools = openaiTools
    if (webSearchOptions) result.web_search_options = webSearchOptions
  }

  // 思考参数：thinking 同结构透传，output_config.effort → reasoning_effort 字段名转换。
  // 两维度正交独立处理，不再按 budget_tokens 反推 reasoning_effort（语义错误）。
  if (anthropicBody.thinking) result.thinking = anthropicBody.thinking
  if (anthropicBody.output_config?.effort) result.reasoning_effort = anthropicBody.output_config.effort

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
