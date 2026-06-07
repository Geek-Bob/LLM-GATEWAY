// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createApiKey, verifyApiKey } from '../../db/api-keys'
import { createProvider, getProviderByName } from '../../db/providers'
import { createLogEntry, updateRequestStats, updateProviderStats } from '../../db/logs'
import { createModelsService } from '../../domains/models/models.service'
import { createServer } from '../server'

describe('Hono Proxy Server', () => {
  let app: ReturnType<typeof createServer>
  let validApiKey: string

  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()

    // Create an API key
    const result = createApiKey('Test Key', 100)
    validApiKey = result.plaintextKey

    // Create a provider with plaintext API key
    // Note: baseUrl does NOT include /v1 — the proxy path includes it so
    // buildProxyUrl produces the correct full URL (see forwarder.test.ts)
    createProvider({
      name: 'test-provider',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'upstream-api-key',
      models: ['gpt-4', 'gpt-3.5-turbo']
    })

    const modelsService = createModelsService(getDb())
    app = createServer({
      verifyApiKey,
      createLogEntry,
      updateRequestStats,
      updateProviderStats,
      modelsService,
      getDebugMode: () => false,
      lookupProvider: (name) => getProviderByName(name) as any,
    })
  })

  let originalFetch: typeof globalThis.fetch

  beforeAll(() => {
    originalFetch = globalThis.fetch
  })

  afterAll(() => {
    closeDatabase()
    globalThis.fetch = originalFetch
  })

  describe('Auth middleware', () => {
    it('should return 401 for POST /v1/chat/completions without auth header', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test-provider/gpt-4', messages: [] })
      })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('unauthorized')
    })

    it('should return 401 for POST /v1/chat/completions with invalid API key', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer sk-invalid-key-that-does-not-exist',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'test-provider/gpt-4', messages: [] })
      })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('unauthorized')
    })

    it('should return 401 for GET /v1/models without auth header', async () => {
      const res = await app.request('/v1/models')
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('unauthorized')
    })

    it('should return 401 for GET /v1/models with invalid auth header', async () => {
      const res = await app.request('/v1/models', {
        headers: { authorization: 'Bearer invalid-key' }
      })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('unauthorized')
    })
  })

  describe('Health endpoint', () => {
    it('should return 200 for GET /health without auth', async () => {
      const res = await app.request('/health')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe('ok')
    })
  })

  describe('GET /v1/models', () => {
    it('should return 200 with model list when authenticated', async () => {
      const res = await app.request('/v1/models', {
        headers: { authorization: `Bearer ${validApiKey}` }
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data).toBeDefined()
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThan(0)

      // Verify model structure
      const model = data.data[0]
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('provider')
      expect(model).toHaveProperty('object', 'model')
    })

    it('should include all models from active providers', async () => {
      const res = await app.request('/v1/models', {
        headers: { authorization: `Bearer ${validApiKey}` }
      })
      expect(res.status).toBe(200)
      const data = await res.json()

      const modelIds = data.data.map((m: any) => m.id)
      expect(modelIds).toContain('test-provider/gpt-4')
      expect(modelIds).toContain('test-provider/gpt-3.5-turbo')
    })
  })

  describe('POST /v1/chat/completions', () => {
    it('should proxy request and return response from upstream', async () => {
      const mockResponseBody = {
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?'
            }
          }
        ]
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponseBody),
        headers: new Headers({ 'content-type': 'application/json' })
      })
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'test-provider/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual(mockResponseBody)

      // Verify fetch was called with the correct upstream URL and headers
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
      expect(fetchUrl).toBe('https://api.openai.com/v1/chat/completions')
      expect(fetchOpts.method).toBe('POST')
      expect(fetchOpts.headers.authorization).toBe('Bearer upstream-api-key')
      expect(fetchOpts.headers['content-type']).toBe('application/json')

      globalThis.fetch = originalFetch
    })

    it('should substitute model name with route modelName in upstream request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [] }),
        headers: new Headers({ 'content-type': 'application/json' })
      })
      globalThis.fetch = mockFetch

      await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'test-provider/gpt-4',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      const [, fetchOpts] = mockFetch.mock.calls[0]
      const sentBody = JSON.parse(fetchOpts.body)
      // The model in the upstream request should be the route modelName, not the full ID
      expect(sentBody.model).toBe('gpt-4')

      globalThis.fetch = originalFetch
    })

    it('should return 404 for non-existent provider model', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'nonexistent-provider/gpt-4',
          messages: []
        })
      })
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toContain('not found')
    })

    it('should return 400 when model is missing from body', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ messages: [] })
      })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('model is required')
    })

    it('should return 400 for raw model name without provider prefix (no slash)', async () => {
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Failed to parse model ID: invalid format')
    })

    it('should return 502 when upstream fetch fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'test-provider/gpt-4',
          messages: []
        })
      })
      expect(res.status).toBe(502)
      const data = await res.json()
      expect(data.error).toBe('Network error')

      globalThis.fetch = originalFetch
    })
  })

  describe('POST /v1/messages', () => {
    beforeAll(() => {
      createProvider({
        name: 'anthropic-test',
        providerType: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-key',
        models: ['claude-3-opus-20240229']
      })
    })

    it('should proxy Anthropic-format requests to the correct path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            content: [{ type: 'text', text: 'Hello!' }]
          }),
        headers: new Headers({ 'content-type': 'application/json' })
      })
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic-test/claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      expect(res.status).toBe(200)

      const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
      expect(fetchUrl).toBe('https://api.anthropic.com/v1/messages')
      expect(fetchOpts.headers['anthropic-version']).toBe('2023-06-01')

      globalThis.fetch = originalFetch
    })

    it('should proxy streaming Anthropic request with deepseek-style SSE and preserve all data', async () => {
      const sseEvents = [
        'event: ping',
        'data: {"type":"ping"}',
        '',
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_001","role":"assistant","content":[],"model":"deepseek","usage":{"input_tokens":5,"output_tokens":0}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Let me think"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" about this."}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Final answer:"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" 42"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        ''
      ].join('\n')

      const encodedSSE = new TextEncoder().encode(sseEvents)
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(encodedSSE)
          controller.close()
        }
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockBody,
        headers: new Headers({
          'content-type': 'text/event-stream',
          'x-request-id': 'test-req-123'
        })
      })
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic-test/claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true
        })
      })

      expect(res.status).toBe(200)

      // Read the response body as text
      const responseText = await res.text()

      // Verify all SSE events are preserved
      expect(responseText).toContain('type":"ping"')
      expect(responseText).toContain('type":"message_start"')
      expect(responseText).toContain('type":"content_block_delta"')
      expect(responseText).toContain('type":"thinking_delta"')
      expect(responseText).toContain('type":"text_delta"')
      expect(responseText).toContain('thinking":" Let me think"')
      expect(responseText).toContain('text":"Final answer:"')

      // Verify content-type is preserved
      expect(res.headers.get('content-type')).toContain('text/event-stream')

      // Verify the full SSE is valid by checking for key markers in order
      const thinkingIndex = responseText.indexOf('thinking":" Let me think')
      const textIndex = responseText.indexOf('text":"Final answer:')
      expect(thinkingIndex).toBeGreaterThan(0)
      expect(textIndex).toBeGreaterThan(thinkingIndex)

      globalThis.fetch = originalFetch
    })

    it('should return clear JSON error when upstream returns 400 for streaming request', async () => {
      const errorBody = JSON.stringify({
        error: { message: 'Model not supported', type: 'invalid_request_error', code: 'model_not_found' }
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(errorBody),
        headers: new Headers({ 'content-type': 'application/json' })
      })
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic-test/claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true
        })
      })

      // Should return proper JSON error, not garbled SSE
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data).toHaveProperty('error')
      expect(data.error.message).toBe('Model not supported')

      globalThis.fetch = originalFetch
    })

    it('should return plain text error when upstream returns non-JSON error for streaming request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
        headers: new Headers({ 'content-type': 'text/plain' })
      })
      globalThis.fetch = mockFetch

      const res = await app.request('/v1/messages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic-test/claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true
        })
      })

      // Should return the plain text error with correct status
      expect(res.status).toBe(502)
      const text = await res.text()
      expect(text).toBe('Bad Gateway')

      globalThis.fetch = originalFetch
    })
  })

})
