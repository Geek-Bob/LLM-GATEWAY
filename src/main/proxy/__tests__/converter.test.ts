// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { mapFinishReason, convertRequest, convertSSEEvent, convertResponse, createStreamContext, type StreamContext } from '../converter'

describe('mapFinishReason', () => {
  describe('toOpenAI direction', () => {
    it('should map end_turn to stop', () => {
      expect(mapFinishReason('end_turn', 'toOpenAI')).toBe('stop')
    })
    it('should map stop_sequence to stop', () => {
      expect(mapFinishReason('stop_sequence', 'toOpenAI')).toBe('stop')
    })
    it('should map max_tokens to length', () => {
      expect(mapFinishReason('max_tokens', 'toOpenAI')).toBe('length')
    })
    it('should map tool_use to tool_calls', () => {
      expect(mapFinishReason('tool_use', 'toOpenAI')).toBe('tool_calls')
    })
    it('should map refusal to content_filter', () => {
      expect(mapFinishReason('refusal', 'toOpenAI')).toBe('content_filter')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toOpenAI')).toBe('unknown_reason')
    })
    it('should handle empty string', () => {
      expect(mapFinishReason('', 'toOpenAI')).toBe('')
    })
  })

  describe('toAnthropic direction', () => {
    it('should map stop to end_turn', () => {
      expect(mapFinishReason('stop', 'toAnthropic')).toBe('end_turn')
    })
    it('should map stop_sequence to stop_sequence', () => {
      expect(mapFinishReason('stop_sequence', 'toAnthropic')).toBe('stop_sequence')
    })
    it('should map length to max_tokens', () => {
      expect(mapFinishReason('length', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map max_tokens to max_tokens', () => {
      expect(mapFinishReason('max_tokens', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map content_filter to refusal', () => {
      expect(mapFinishReason('content_filter', 'toAnthropic')).toBe('refusal')
    })
    it('should map tool_calls to tool_use', () => {
      expect(mapFinishReason('tool_calls', 'toAnthropic')).toBe('tool_use')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toAnthropic')).toBe('unknown_reason')
    })
  })
})

describe('convertRequest O→A', () => {
  const minimalOpenaiBody = {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ],
  }

  it('should convert path from /v1/chat/completions to /v1/messages', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.path).toBe('/v1/messages')
  })

  it('should extract system message to top-level system field', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.system).toEqual([
      { type: 'text', text: 'You are helpful.' },
    ])
  })

  it('should NOT include system role in messages array', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    const hasSystem = result.body.messages.some(
      (m: any) => m.role === 'system'
    )
    expect(hasSystem).toBe(false)
  })

  it('should preserve user messages', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.messages).toHaveLength(1)
    expect(result.body.messages[0]).toEqual({
      role: 'user',
      content: 'Hello',
    })
  })

  it('should passthrough basic fields', () => {
    const body = {
      ...minimalOpenaiBody,
      model: 'gpt-4-turbo',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 0.9,
      stream: true,
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.model).toBe('gpt-4-turbo')
    expect(result.body.temperature).toBe(0.7)
    expect(result.body.max_tokens).toBe(1000)
    expect(result.body.top_p).toBe(0.9)
    expect(result.body.stream).toBe(true)
  })

  it('should passthrough top_k if present', () => {
    const body = { ...minimalOpenaiBody, top_k: 50 }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.top_k).toBe(50)
  })

  it('should convert stop string to stop_sequences array', () => {
    const body = { ...minimalOpenaiBody, stop: '\n\n' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.stop_sequences).toEqual(['\n\n'])
  })

  it('should convert stop array to stop_sequences array', () => {
    const body = { ...minimalOpenaiBody, stop: ['\n', 'END'] }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.stop_sequences).toEqual(['\n', 'END'])
  })

  it('should merge consecutive same-role messages', () => {
    const body = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Part 1' },
        { role: 'user', content: 'Part 2' },
      ],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages).toHaveLength(1)
    expect(result.body.messages[0].content).toBe('Part 1 Part 2')
  })

  it('should replace empty content with "..."', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: '' }],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages[0].content).toBe('...')
  })

  it('should insert user placeholder if first message is assistant', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'assistant', content: 'I already started.' }],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.messages[0]).toEqual({
      role: 'user',
      content: '...',
    })
    expect(result.body.messages[1].role).toBe('assistant')
  })

  it('should convert OpenAI tools to Claude Tool format', () => {
    const body = {
      ...minimalOpenaiBody,
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tools).toHaveLength(1)
    expect(result.body.tools[0]).toEqual({
      name: 'get_weather',
      description: 'Get current weather',
      input_schema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    })
  })

  it('should map tool_choice auto', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'auto' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'auto' })
  })

  it('should map tool_choice required to any', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'required' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'any' })
  })

  it('should map tool_choice none', () => {
    const body = { ...minimalOpenaiBody, tool_choice: 'none' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tool_choice).toEqual({ type: 'none' })
  })

  it('should map reasoning_effort to thinking budget_tokens', () => {
    const body = { ...minimalOpenaiBody, reasoning_effort: 'medium' }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 2048,
    })
  })

  it('should map response_format json_object to system prompt', () => {
    const body = {
      ...minimalOpenaiBody,
      response_format: { type: 'json_object' },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.system).toBeDefined()
    const lastSystem = result.body.system[result.body.system.length - 1]
    expect(lastSystem.text).toContain('valid JSON')
  })

  it('should convert response_format json_schema to tool + tool_choice', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    }
    const body = {
      ...minimalOpenaiBody,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'MySchema', strict: true, schema },
      },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.tools).toBeDefined()
    expect(result.body.tools[0].name).toBe('MySchema')
    expect(result.body.tools[0].input_schema).toEqual(schema)
    expect(result.body.tool_choice).toEqual({
      type: 'tool',
      name: 'MySchema',
    })
  })

  it('should remove incompatible OpenAI fields', () => {
    const body = {
      ...minimalOpenaiBody,
      n: 3,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      seed: 42,
      logprobs: true,
      top_logprobs: 3,
      logit_bias: { '1234': 5 },
      stream_options: { include_usage: true },
    }
    const result = convertRequest(body, 'openai', 'anthropic')
    expect(result.body.n).toBeUndefined()
    expect(result.body.frequency_penalty).toBeUndefined()
    expect(result.body.presence_penalty).toBeUndefined()
    expect(result.body.seed).toBeUndefined()
    expect(result.body.logprobs).toBeUndefined()
    expect(result.body.top_logprobs).toBeUndefined()
    expect(result.body.logit_bias).toBeUndefined()
    expect(result.body.stream_options).toBeUndefined()
  })

  it('should add default max_tokens if missing', () => {
    const result = convertRequest(minimalOpenaiBody, 'openai', 'anthropic')
    expect(result.body.max_tokens).toBeDefined()
    expect(result.body.max_tokens).toBeGreaterThan(0)
  })
})

describe('convertRequest A→O', () => {
  const minimalClaudeBody = {
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'user', content: 'Hello' },
    ],
    max_tokens: 1024,
  }

  it('should convert path from /v1/messages to /v1/chat/completions', () => {
    const result = convertRequest(minimalClaudeBody, 'anthropic', 'openai')
    expect(result.path).toBe('/v1/chat/completions')
  })

  it('should convert system field to system role message', () => {
    const body = {
      ...minimalClaudeBody,
      system: [{ type: 'text', text: 'You are helpful.' }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    })
  })

  it('should convert string system field', () => {
    const body = {
      ...minimalClaudeBody,
      system: 'You are helpful.',
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    })
  })

  it('should passthrough basic fields', () => {
    const body = {
      ...minimalClaudeBody,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 50,
      stream: true,
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.model).toBe('claude-sonnet-4-5')
    expect(result.body.temperature).toBeCloseTo(0.7)
    expect(result.body.top_p).toBeCloseTo(0.9)
    expect(result.body.top_k).toBe(50)
    expect(result.body.stream).toBe(true)
  })

  it('should convert stop_sequences to stop string for single item', () => {
    const body = { ...minimalClaudeBody, stop_sequences: ['END'] }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.stop).toBe('END')
  })

  it('should convert stop_sequences to stop array for multiple items', () => {
    const body = { ...minimalClaudeBody, stop_sequences: ['END', 'STOP'] }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.stop).toEqual(['END', 'STOP'])
  })

  it('should convert Claude tools to OpenAI function tools', () => {
    const body = {
      ...minimalClaudeBody,
      tools: [{
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.tools).toHaveLength(1)
    expect(result.body.tools[0].type).toBe('function')
    expect(result.body.tools[0].function.name).toBe('get_weather')
  })

  it('should convert thinking enabled to reasoning_effort', () => {
    const body = {
      ...minimalClaudeBody,
      thinking: { type: 'enabled', budget_tokens: 2048 },
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.reasoning_effort).toBe('medium')
  })

  it('should convert tool_use in message to tool_calls', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { city: 'NYC' } },
          ],
        },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const assistantMsg = result.body.messages[1]
    expect(assistantMsg.tool_calls).toBeDefined()
    expect(assistantMsg.tool_calls[0].id).toBe('toolu_01')
    expect(assistantMsg.tool_calls[0].function.name).toBe('get_weather')
  })

  it('should convert tool_result to tool role message', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the weather?' },
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'Sunny, 72F' },
          ],
        },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const toolMsg = result.body.messages.find((m: any) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg.tool_call_id).toBe('toolu_01')
  })

  it('should handle web_search tool conversion', () => {
    const body = {
      ...minimalClaudeBody,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        user_location: { type: 'approximate', country: 'US' },
      }],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    expect(result.body.web_search_options).toBeDefined()
    expect(result.body.web_search_options.search_context_size).toBe('medium')
  })

  it('should preserve thinking blocks as reasoning_content in assistant messages', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think about this...' },
            { type: 'text', text: 'The answer is 42.' },
          ],
        },
        { role: 'user', content: 'Thanks' },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const msgs = result.body.messages
    expect(msgs).toHaveLength(3)
    const assistantMsg = msgs[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.content).toBe('The answer is 42.')
    expect(assistantMsg.reasoning_content).toBe('Let me think about this...')
  })

  it('should preserve reasoning_content for assistant message with only thinking', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'Hmm...' }],
        },
        { role: 'user', content: 'Go on' },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const msgs = result.body.messages
    const assistantMsg = msgs[1]
    expect(assistantMsg.reasoning_content).toBe('Hmm...')
    expect(assistantMsg.content).toBe('')
  })

  it('should preserve reasoning_content alongside tool_calls', () => {
    const body = {
      ...minimalClaudeBody,
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I should use a tool.' },
            { type: 'tool_use', id: 'tool_1', name: 'search', input: { q: 'test' } },
          ],
        },
      ],
    }
    const result = convertRequest(body, 'anthropic', 'openai')
    const msgs = result.body.messages
    const assistantMsg = msgs[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.tool_calls).toBeDefined()
    expect(assistantMsg.reasoning_content).toBe('I should use a tool.')
  })
})

describe('convertResponse C→O', () => {
  it('should convert Claude text response to OpenAI format', () => {
    const claudeResp = {
      id: 'msg_123',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello! How can I help?' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.id).toBe('msg_123')
    expect(result.object).toBe('chat.completion')
    expect(result.choices).toHaveLength(1)
    expect(result.choices[0].message.content).toBe('Hello! How can I help?')
    expect(result.choices[0].finish_reason).toBe('stop')
    expect(result.usage.prompt_tokens).toBe(10)
    expect(result.usage.completion_tokens).toBe(5)
  })

  it('should convert Claude tool_use to OpenAI tool_calls', () => {
    const claudeResp = {
      id: 'msg_456',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'toolu_01',
        name: 'get_weather',
        input: { city: 'NYC' },
      }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.choices[0].message.tool_calls).toBeDefined()
    expect(result.choices[0].message.tool_calls[0].id).toBe('toolu_01')
    expect(result.choices[0].message.tool_calls[0].function.name).toBe('get_weather')
    expect(result.choices[0].finish_reason).toBe('tool_calls')
  })

  it('should convert Claude thinking to OpenAI reasoning_content', () => {
    const claudeResp = {
      id: 'msg_789',
      model: 'claude-sonnet-4-5',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 10 },
    }
    const result = convertResponse(claudeResp, 'anthropic', 'openai')
    expect(result.choices[0].message.reasoning_content).toBe('Let me think about this...')
  })
})

describe('convertResponse O→C', () => {
  it('should convert OpenAI text response to Claude format', () => {
    const openaiResp = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
    const result = convertResponse(openaiResp, 'openai', 'anthropic')
    expect(result.id).toBe('chatcmpl-abc')
    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('Hello!')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.usage.input_tokens).toBe(10)
    expect(result.usage.output_tokens).toBe(5)
  })

  it('should convert OpenAI tool_calls to Claude tool_use', () => {
    const openaiResp = {
      id: 'chatcmpl-def',
      object: 'chat.completion',
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
    }
    const result = convertResponse(openaiResp, 'openai', 'anthropic')
    expect(result.content[0].type).toBe('tool_use')
    expect(result.content[0].id).toBe('call_123')
    expect(result.content[0].name).toBe('get_weather')
    expect(result.content[0].input).toEqual({ city: 'NYC' })
  })
})

describe('convertResponse error conversion', () => {
  it('should convert Anthropic error to OpenAI error format', () => {
    const claudeErr = {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Model not found' },
    }
    const result = convertResponse(claudeErr, 'anthropic', 'openai')
    expect(result.error).toBeDefined()
    expect(result.error.type).toBe('invalid_request_error')
    expect(result.error.message).toBe('Model not found')
  })

  it('should convert OpenAI error to Anthropic error format', () => {
    const openaiErr = {
      error: { type: 'invalid_request_error', message: 'Model not found' },
    }
    const result = convertResponse(openaiErr, 'openai', 'anthropic')
    expect(result.type).toBe('error')
    expect(result.error.type).toBe('invalid_request_error')
    expect(result.error.message).toBe('Model not found')
  })
})

describe('convertSSEEvent C→O', () => {
  it('should convert message_start to role delta', () => {
    const data = {
      type: 'message_start',
      message: { id: 'msg_001', model: 'claude-sonnet-4-5', role: 'assistant' },
    }
    const result = convertSSEEvent('message_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('')
    expect(result!.data.object).toBe('chat.completion.chunk')
    expect(result!.data.choices[0].delta.role).toBe('assistant')
    expect(result!.data.id).toBe('msg_001')
    expect(result!.data.model).toBe('claude-sonnet-4-5')
  })

  it('should convert content_block_start text to first content delta', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: 'Hello' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.content).toBe('Hello')
  })

  it('should convert content_block_start tool_use to ToolCallResponse', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_01', name: 'get_weather' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.tool_calls[0].id).toBe('toolu_01')
    expect(result!.data.choices[0].delta.tool_calls[0].function.name).toBe('get_weather')
  })

  it('should convert content_block_start thinking to reasoning delta', () => {
    const data = {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    }
    const result = convertSSEEvent('content_block_start', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.reasoning_content).toBe('')
  })

  it('should convert content_block_delta text_delta to content delta', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: ' world' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.content).toBe(' world')
  })

  it('should convert content_block_delta input_json_delta to tool call arguments', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"city"' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.tool_calls[0].function.arguments).toBe('{"city"')
  })

  it('should convert content_block_delta thinking_delta to reasoning delta', () => {
    const data = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Let me think...' },
    }
    const result = convertSSEEvent('content_block_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].delta.reasoning_content).toBe('Let me think...')
  })

  it('should convert message_delta to finish_reason', () => {
    const data = {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 25 },
    }
    const result = convertSSEEvent('message_delta', data, 'anthropic', 'openai')
    expect(result).not.toBeNull()
    expect(result!.data.choices[0].finish_reason).toBe('stop')
  })

  it('should return null for message_stop', () => {
    const data = { type: 'message_stop' }
    const result = convertSSEEvent('message_stop', data, 'anthropic', 'openai')
    expect(result).toBeNull()
  })

  it('should return null for unknown event types', () => {
    const result = convertSSEEvent('ping', {}, 'anthropic', 'openai')
    expect(result).toBeNull()
  })
})

describe('convertSSEEvent O→C', () => {
  let ctx: StreamContext

  beforeEach(() => {
    ctx = createStreamContext()
  })

  it('should convert first chunk to message_start', () => {
    const data = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic', ctx)
    expect(result).not.toBeNull()
    const single = result as { event: string; data: any }
    expect(single.event).toBe('message_start')
    expect(single.data.message.model).toBe('gpt-4')
    expect(single.data.message.role).toBe('assistant')
  })

  it('should convert text delta to content_block_start + text_delta', () => {
    // First send message_start
    const startData = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    convertSSEEvent('', startData, 'openai', 'anthropic', ctx)

    // Then text content
    const data = {
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { content: 'Hello' } }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic', ctx)
    expect(Array.isArray(result)).toBe(true)
    const arr = result as Array<{ event: string; data: any }>
    expect(arr[0].event).toBe('content_block_start')
    expect(arr[1].event).toBe('content_block_delta')
    expect(arr[1].data.delta.text).toBe('Hello')
  })

  it('should return null for empty content chunks after message_start', () => {
    const data = {
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {} }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic', ctx)
    expect(result).toBeNull()
  })

  it('should convert finish_reason to message_delta + message_stop', () => {
    const data = {
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, finish_reason: 'stop', delta: {} }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic', ctx)
    expect(Array.isArray(result)).toBe(true)
    const arr = result as Array<{ event: string; data: any }>
    const messageDelta = arr.find((r: any) => r.event === 'message_delta')
    expect(messageDelta).toBeDefined()
    expect(messageDelta!.data.delta.stop_reason).toBe('end_turn')
    const messageStop = arr.find((r: any) => r.event === 'message_stop')
    expect(messageStop).toBeDefined()
  })

  it('should reuse cached model name from message_start', () => {
    const startData = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    }
    convertSSEEvent('', startData, 'openai', 'anthropic', ctx)

    const data = {
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: 'Testing' } }],
    }
    const result = convertSSEEvent('', data, 'openai', 'anthropic', ctx)
    expect(result).not.toBeNull()
  })
})
