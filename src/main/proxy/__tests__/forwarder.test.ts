import { describe, it, expect } from 'vitest'
import { buildProxyUrl, buildProxyHeaders } from '../forwarder'
import type { Provider } from '../../../shared/types'

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

  it('should deduplicate overlapping /v1 prefix in path when baseUrl already ends with /v1', () => {
    const provider = makeProvider({ baseUrl: 'https://opencode.ai/zen/go/v1' })
    const url = buildProxyUrl(provider, '/v1/chat/completions')
    expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions')
  })

  it('should deduplicate overlapping /v1 prefix when baseUrl has trailing slash', () => {
    const provider = makeProvider({ baseUrl: 'https://opencode.ai/zen/go/v1/' })
    const url = buildProxyUrl(provider, '/v1/chat/completions')
    expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions')
  })

  it('should only deduplicate overlapping segments (not partial matches)', () => {
    const provider = makeProvider({ baseUrl: 'https://api.example.com/v12' })
    const url = buildProxyUrl(provider, '/v1/chat/completions')
    expect(url).toBe('https://api.example.com/v12/v1/chat/completions')
  })

  it('should deduplicate multi-segment overlap', () => {
    const provider = makeProvider({ baseUrl: 'https://api.example.com/api/v1/openai' })
    const url = buildProxyUrl(provider, '/api/v1/openai/chat/completions')
    expect(url).toBe('https://api.example.com/api/v1/openai/chat/completions')
  })
})

describe('buildProxyHeaders', () => {
  const decryptedKey = 'sk-test-key-12345'

  it('should set authorization header with Bearer token for openai provider', () => {
    const provider = makeProvider({ providerType: 'openai' })
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers.authorization).toBe('Bearer sk-test-key-12345')
  })

  it('should set x-api-key header for anthropic provider', () => {
    const provider = makeProvider({ providerType: 'anthropic' })
    const headers = buildProxyHeaders(provider, decryptedKey, {})
    expect(headers['x-api-key']).toBe('sk-test-key-12345')
    expect(headers.authorization).toBeUndefined()
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
