import { describe, it, expect } from 'vitest'
import { buildProxyUrl, buildProxyHeaders, buildProxyBody } from '../forwarder'
import type { Provider } from '../../db/providers'

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 1,
    name: 'test-provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'encrypted-key',
    models: ['gpt-4'],
    isActive: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('buildProxyUrl', () => {
  it('should concatenate base URL and path correctly', () => {
    const provider = makeProvider({ baseUrl: 'https://api.openai.com/v1' })
    const url = buildProxyUrl(provider, '/chat/completions')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('should handle base URL with trailing slash', () => {
    const provider = makeProvider({ baseUrl: 'https://api.openai.com/v1/' })
    const url = buildProxyUrl(provider, '/chat/completions')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('should handle base URL with multiple trailing slashes', () => {
    const provider = makeProvider({ baseUrl: 'https://api.openai.com/v1//' })
    const url = buildProxyUrl(provider, '/chat/completions')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('should add leading slash to path if missing', () => {
    const provider = makeProvider({ baseUrl: 'https://api.openai.com/v1' })
    const url = buildProxyUrl(provider, 'chat/completions')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('should work with base URL that has no trailing slash and path with slash', () => {
    const provider = makeProvider({ baseUrl: 'https://api.anthropic.com' })
    const url = buildProxyUrl(provider, '/v1/messages')
    expect(url).toBe('https://api.anthropic.com/v1/messages')
  })
})

describe('buildProxyHeaders', () => {
  const decryptedKey = 'sk-test-key-12345'

  it('should set authorization header with Bearer token', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers.authorization).toBe('Bearer sk-test-key-12345')
  })

  it('should set content-type header with default application/json', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers['content-type']).toBe('application/json')
  })

  it('should preserve original content-type header', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {
      'content-type': 'application/x-ndjson'
    })
    expect(headers['content-type']).toBe('application/x-ndjson')
  })

  it('should preserve original Content-Type with capital letters', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {
      'Content-Type': 'text/event-stream'
    })
    expect(headers['content-type']).toBe('text/event-stream')
  })

  it('should pass through original headers', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {
      'x-request-id': 'abc-123',
      'x-custom-header': 'custom-value'
    })
    expect(headers['x-request-id']).toBe('abc-123')
    expect(headers['x-custom-header']).toBe('custom-value')
  })

  it('should add anthropic-version header for anthropic provider', () => {
    const provider = makeProvider({ providerType: 'anthropic' })
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('should NOT add anthropic-version header for openai provider', () => {
    const provider = makeProvider({ providerType: 'openai' })
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers['anthropic-version']).toBeUndefined()
  })

  it('should override authorization even if original headers contain it', () => {
    const provider = makeProvider()
    const headers = buildProxyHeaders(provider, decryptedKey, {
      authorization: 'Bearer old-key'
    })
    expect(headers.authorization).toBe('Bearer sk-test-key-12345')
  })
})

describe('buildProxyBody', () => {
  it('should pass through the body unchanged', () => {
    const provider = makeProvider()
    const body = { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] }
    const result = buildProxyBody(body, provider)
    expect(result).toBe(body)
  })

  it('should pass through primitive values', () => {
    const provider = makeProvider()
    expect(buildProxyBody('string', provider)).toBe('string')
    expect(buildProxyBody(42, provider)).toBe(42)
    expect(buildProxyBody(null, provider)).toBeNull()
  })

  it('should pass through array body', () => {
    const provider = makeProvider()
    const arr = [1, 2, 3]
    const result = buildProxyBody(arr, provider)
    expect(result).toBe(arr)
  })
})
