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
            // thinking blocks don't map to OpenAI — skip
            break
        }
      }

      if (toolCalls.length > 0) {
        const assistantMsg: Record<string, any> = { role: msg.role, content: null }
        if (texts.length > 0) {
          assistantMsg.content = texts.join(' ')
        }
        assistantMsg.tool_calls = toolCalls
        openaiMessages.push(assistantMsg)
      } else if (mediaContents.length > 0) {
        const allContent = [
          ...texts.map((t: string) => ({ type: 'text', text: t })),
          ...mediaContents,
        ]
        openaiMessages.push({ role: msg.role, content: allContent })
      } else if (texts.length > 0) {
        openaiMessages.push({ role: msg.role, content: texts.join(' ') })
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

function anthropicToOpenAIResponse(
  anthropicBody: Record<string, any>
): Record<string, any> {
  if (anthropicBody.type === 'error') {
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
      let input: any = {}
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
  } else if (choice.message?.content) {
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

export function convertRequest(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { body: any; path: string } {
  if (from === to) return { body, path: from === 'openai' ? '/v1/chat/completions' : '/v1/messages' }
  if (from === 'openai' && to === 'anthropic') return openaiToAnthropicRequest(body)
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIRequest(body)
  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}

export function convertResponse(
  body: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): any {
  if (from === to) return body
  if (from === 'anthropic' && to === 'openai') return anthropicToOpenAIResponse(body)
  if (from === 'openai' && to === 'anthropic') return openAIToAnthropicResponse(body)
  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}

function anthropicSSEToOpenAI(
  _event: string,
  data: Record<string, any>
): { event: string; data: any } | null {
  switch (data.type) {
    case 'message_start': {
      const msg = data.message ?? {}
      return {
        event: '',
        data: {
          id: msg.id,
          object: 'chat.completion.chunk',
          model: msg.model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
        },
      }
    }

    case 'content_block_start': {
      const block = data.content_block ?? {}
      const index = data.index ?? 0
      if (block.type === 'text') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { content: block.text ?? '' } }],
          },
        }
      } else if (block.type === 'tool_use') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{
              index,
              delta: {
                tool_calls: [{
                  index,
                  id: block.id,
                  type: 'function',
                  function: { name: block.name, arguments: '' },
                }],
              },
            }],
          },
        }
      } else if (block.type === 'thinking') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: block.thinking ?? '' } }],
          },
        }
      }
      return null
    }

    case 'content_block_delta': {
      const delta = data.delta ?? {}
      const index = data.index ?? 0
      if (delta.type === 'text_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { content: delta.text ?? '' } }],
          },
        }
      } else if (delta.type === 'input_json_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{
              index,
              delta: {
                tool_calls: [{
                  index,
                  function: { arguments: delta.partial_json ?? '' },
                }],
              },
            }],
          },
        }
      } else if (delta.type === 'thinking_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: delta.thinking ?? '' } }],
          },
        }
      } else if (delta.type === 'signature_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: '\n' } }],
          },
        }
      }
      return null
    }

    case 'message_delta': {
      const delta = data.delta ?? {}
      const stopReason = delta.stop_reason
      const finishReason = stopReason ? mapFinishReason(stopReason, 'toOpenAI') : null
      return {
        event: '',
        data: {
          object: 'chat.completion.chunk',
          choices: [{ index: 0, finish_reason: finishReason, delta: {} }],
          ...(data.usage ? {
            usage: {
              prompt_tokens: data.usage.input_tokens ?? 0,
              completion_tokens: data.usage.output_tokens ?? 0,
              total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
            },
          } : {}),
        },
      }
    }

    case 'message_stop':
      return null

    default:
      return null
  }
}

// StreamState for OpenAI→Anthropic SSC conversion
interface StreamState {
  lastMessagesType: 'none' | 'text' | 'thinking' | 'tools'
  index: number
  toolCallBaseIndex: number
  toolCallMaxIndexOffset: number
  done: boolean
  finishReason: string
  model: string
  id: string
}

const _streamState: StreamState = {
  lastMessagesType: 'none',
  index: 0,
  toolCallBaseIndex: 0,
  toolCallMaxIndexOffset: 0,
  done: false,
  finishReason: '',
  model: '',
  id: '',
}

function resetStreamState(): void {
  _streamState.lastMessagesType = 'none'
  _streamState.index = 0
  _streamState.toolCallBaseIndex = 0
  _streamState.toolCallMaxIndexOffset = 0
  _streamState.done = false
  _streamState.finishReason = ''
  _streamState.model = ''
  _streamState.id = ''
}

function contentBlockStop(index: number) {
  return { event: 'content_block_stop', data: { type: 'content_block_stop', index } }
}

function stopOpenBlocks(): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  const s = _streamState
  switch (s.lastMessagesType) {
    case 'text':
    case 'thinking':
      result.push(contentBlockStop(s.index))
      break
    case 'tools':
      for (let offset = 0; offset <= s.toolCallMaxIndexOffset; offset++) {
        result.push(contentBlockStop(s.toolCallBaseIndex + offset))
      }
      break
  }
  return result
}

function stopOpenBlocksAndAdvance(): Array<{ event: string; data: any }> {
  const s = _streamState
  if (s.lastMessagesType === 'none') return []
  const result = stopOpenBlocks()
  switch (s.lastMessagesType) {
    case 'tools':
      s.index = s.toolCallBaseIndex + s.toolCallMaxIndexOffset + 1
      s.toolCallBaseIndex = 0
      s.toolCallMaxIndexOffset = 0
      break
    default:
      s.index++
  }
  s.lastMessagesType = 'none'
  return result
}

const _sentMessageStart = { current: false }

function openAISSEToAnthropic(
  data: Record<string, any>
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  const s = _streamState
  if (s.done) return null

  const choice = data.choices?.[0]
  if (!choice) {
    // Usage-only chunk (no choices) — close stream if finish reason was set
    if (s.finishReason && data.usage) {
      s.done = true
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(s.finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
    return null
  }

  const delta = choice.delta ?? {}

  // First chunk → message_start
  if (!_sentMessageStart.current && (data.id || s.id)) {
    _sentMessageStart.current = true
    if (data.id) s.id = data.id
    if (data.model) s.model = data.model
    return {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: s.id,
          model: s.model,
          type: 'message',
          role: 'assistant',
          usage: { input_tokens: 0, output_tokens: 0 },
          content: [],
        },
      },
    }
  }

  const reasoning = delta.reasoning_content ?? ''
  const textContent = delta.content ?? ''
  const toolCalls: Array<Record<string, any>> = delta.tool_calls ?? []

  if (reasoning) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'thinking') {
      result.push(...stopOpenBlocksAndAdvance())
      result.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: s.index,
          content_block: { type: 'thinking', thinking: '' },
        },
      })
    }
    s.lastMessagesType = 'thinking'
    result.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: s.index,
        delta: { type: 'thinking_delta', thinking: reasoning },
      },
    })
    return result
  }

  if (textContent) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'text') {
      result.push(...stopOpenBlocksAndAdvance())
      result.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: s.index,
          content_block: { type: 'text', text: '' },
        },
      })
    }
    s.lastMessagesType = 'text'
    result.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: s.index,
        delta: { type: 'text_delta', text: textContent },
      },
    })
    return result
  }

  if (toolCalls.length > 0) {
    const result: Array<{ event: string; data: any }> = []
    if (s.lastMessagesType !== 'tools') {
      result.push(...stopOpenBlocksAndAdvance())
      s.toolCallBaseIndex = s.index
      s.toolCallMaxIndexOffset = 0
    }
    s.lastMessagesType = 'tools'
    const base = s.toolCallBaseIndex
    let maxOffset = s.toolCallMaxIndexOffset

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]
      const offset = tc.index ?? i
      if (offset > maxOffset) maxOffset = offset
      const blockIndex = base + offset

      if (tc.function?.name) {
        result.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: {},
            },
          },
        })
      }
      if (tc.function?.arguments) {
        result.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
          },
        })
      }
    }
    s.toolCallMaxIndexOffset = maxOffset
    s.index = base + maxOffset
    return result
  }

  // Check for finish_reason
  const finishReason = choice.finish_reason
  if (finishReason && !s.done) {
    s.finishReason = finishReason
    // Don't close yet if usage is still coming
    if (data.usage) {
      s.done = true
      _sentMessageStart.current = false
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
  }

  return null
}

export { resetStreamState }

export function convertSSEEvent(
  event: string,
  data: any,
  from: ProtocolFormat,
  to: ProtocolFormat
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  if (from === to) return { event, data }
  if (from === 'anthropic' && to === 'openai') {
    const result = anthropicSSEToOpenAI(event, data)
    return result ? { event: result.event || '', data: result.data } : null
  }
  if (from === 'openai' && to === 'anthropic') {
    // Reset state on [DONE] signal or new stream
    if (event === 'done' || (event === '' && data === null)) {
      resetStreamState()
      return null
    }
    // Auto-reset if new stream detected and previous stream state exists
    const s = _streamState
    if (data?.id && (s.done || _sentMessageStart.current)) {
      resetStreamState()
      _sentMessageStart.current = false
    }
    return openAISSEToAnthropic(data) as any
  }
  return null
}
