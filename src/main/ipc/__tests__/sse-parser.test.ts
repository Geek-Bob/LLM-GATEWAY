// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  parseSSELine,
  tryExtractText,
  extractFromAnthropicSSE,
  extractFromOpenaiSSE,
  parseAnthropicSSE,
  parseOpenaiSSE
} from '../sse-parser'

describe('parseSSELine', () => {
  it('parses data line', () => {
    expect(parseSSELine('data: {"key":"val"}')).toEqual({
      raw: 'data: {"key":"val"}',
      data: '{"key":"val"}'
    })
  })

  it('parses event line', () => {
    expect(parseSSELine('event: content_block_delta')).toEqual({
      raw: 'event: content_block_delta',
      eventType: 'content_block_delta'
    })
  })

  it('returns null for empty line', () => {
    expect(parseSSELine('')).toBeNull()
  })

  it('returns null for comment line (starts with :)', () => {
    expect(parseSSELine(': ping')).toBeNull()
  })

  it('handles data without space after colon', () => {
    const result = parseSSELine('data:{"key":"val"}')
    expect(result?.data).toBe('{"key":"val"}')
  })
})

describe('tryExtractText', () => {
  it('extracts text_delta', () => {
    const result = tryExtractText({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' }
    })
    expect(result).toEqual({ text: 'Hello', chunkType: 'text' })
  })

  it('extracts thinking_delta (deepseek internal reasoning)', () => {
    const result = tryExtractText({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: '思考中...' }
    })
    expect(result).toEqual({ text: '思考中...', chunkType: 'thinking' })
  })

  it('returns null for non-content_block_delta', () => {
    expect(tryExtractText({ type: 'message_start' })).toBeNull()
    expect(tryExtractText({ type: 'content_block_stop' })).toBeNull()
    expect(tryExtractText({ type: 'message_delta' })).toBeNull()
    expect(tryExtractText({ type: 'ping' })).toBeNull()
  })

  it('returns null for content_block_delta without delta field', () => {
    expect(tryExtractText({ type: 'content_block_delta' })).toBeNull()
  })

  it('returns null for empty delta', () => {
    expect(tryExtractText({ type: 'content_block_delta', delta: {} })).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(tryExtractText(null)).toBeNull()
    expect(tryExtractText(undefined)).toBeNull()
  })

  it('returns null for unknown delta types', () => {
    const result = tryExtractText({
      type: 'content_block_delta',
      delta: { type: 'unknown_delta', text: 'fallback' }
    })
    expect(result).toBeNull()
  })
})

describe('extractFromAnthropicSSE', () => {
  it('extracts from valid content_block_delta JSON', () => {
    const result = extractFromAnthropicSSE(
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}'
    )
    expect(result).toBe('Hello')
  })

  it('extracts deepseek thinking_delta JSON', () => {
    const result = extractFromAnthropicSSE(
      '{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" thinking text"}}'
    )
    expect(result).toBe(' thinking text')
  })

  it('returns empty for malformed JSON', () => {
    expect(extractFromAnthropicSSE('not json')).toBe('')
  })

  it('returns empty for non-delta event', () => {
    expect(extractFromAnthropicSSE(
      '{"type":"message_start","message":{"id":"msg_123"}}'
    )).toBe('')
  })
})

describe('extractFromOpenaiSSE', () => {
  it('extracts delta content', () => {
    const result = extractFromOpenaiSSE(
      '{"choices":[{"index":0,"delta":{"content":"Hello"}}]}'
    )
    expect(result).toBe('Hello')
  })

  it('extracts text field when delta is missing', () => {
    const result = extractFromOpenaiSSE(
      '{"choices":[{"index":0,"text":"Hello"}]}'
    )
    expect(result).toBe('Hello')
  })

  it('returns empty for empty delta', () => {
    const result = extractFromOpenaiSSE(
      '{"choices":[{"index":0,"delta":{}}]}'
    )
    expect(result).toBe('')
  })

  it('returns empty for malformed JSON', () => {
    expect(extractFromOpenaiSSE('not json')).toBe('')
  })
})

describe('parseAnthropicSSE - full stream with deepseek thinking', () => {
  const sseText = [
    'event: ping',
    'data: {"type":"ping"}',
    '',
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_001","role":"assistant","content":[],"model":"deepseek","usage":{"input_tokens":10,"output_tokens":0}}}',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Let me think"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" step by step."}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Here is my answer:"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" It works!"}}',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    ''
  ].join('\n')

  it('extracts all chunks in order (thinking + text)', () => {
    const chunks = parseAnthropicSSE(sseText)
    expect(chunks).toHaveLength(4)
    expect(chunks[0]).toBe(' Let me think')
    expect(chunks[1]).toBe(' step by step.')
    expect(chunks[2]).toBe('Here is my answer:')
    expect(chunks[3]).toBe(' It works!')
  })

  it('output includes both thinking and text content', () => {
    const chunks = parseAnthropicSSE(sseText)
    const fullText = chunks.join('')
    expect(fullText).toBe(' Let me think step by step.Here is my answer: It works!')
  })
})

describe('parseOpenaiSSE - full stream', () => {
  const sseText = [
    'data: {"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
    'data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}',
    'data: {"choices":[{"index":0,"delta":{"content":" world"}}]}',
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    'data: [DONE]',
    ''
  ].join('\n')

  it('extracts all text chunks in order, skipping DONE', () => {
    const chunks = parseOpenaiSSE(sseText)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('Hello')
    expect(chunks[1]).toBe(' world')
  })
})

describe('parseAnthropicSSE - real-world scenarios', () => {
  it('handles empty sse text', () => {
    expect(parseAnthropicSSE('')).toEqual([])
  })

  it('handles sse with only events and no data', () => {
    const text = [
      'event: ping',
      'data: {"type":"ping"}',
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"m","content":[]}}',
    ].join('\n')
    expect(parseAnthropicSSE(text)).toEqual([])
  })

  it('handles sse with multiple content blocks', () => {
    const text = [
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Block1"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"Block2 thinking"}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Block2 text"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":1}',
    ].join('\n')
    const chunks = parseAnthropicSSE(text)
    expect(chunks).toHaveLength(3)
  })

  it('extracts thinking_delta content', () => {
    const text = [
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Hello world"}}',
    ].join('\n')
    const chunks = parseAnthropicSSE(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(' Hello world')
  })
})
