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

export function mapFinishReason(
  reason: string,
  direction: 'toOpenAI' | 'toAnthropic'
): string {
  if (!reason) return ''
  const map = direction === 'toOpenAI' ? CLAUDE_TO_OPENAI : OPENAI_TO_CLAUDE
  return map[reason.toLowerCase()] ?? reason
}

type ProtocolFormat = 'openai' | 'anthropic'

// OpenAI incompatible fields (not supported by Anthropic)
const OPENAI_INCOMPATIBLE_FIELDS = [
  'n', 'frequency_penalty', 'presence_penalty', 'seed',
  'logprobs', 'top_logprobs', 'logit_bias', 'stream_options',
]

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
          try { inputObj = JSON.parse(tc.function?.arguments || '{}') } catch {}
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

function convertRequest(
  body: Record<string, any>,
  from: ProtocolFormat,
  to: ProtocolFormat
): { body: Record<string, any>; path: string } {
  if (from === 'openai' && to === 'anthropic') {
    return openaiToAnthropicRequest(body)
  }
  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}

export { openaiToAnthropicRequest, mapToolChoice, convertRequest }
