// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createProvider, getProviderByName, updateProvider, type ProviderRow } from '../../db/providers'
import type { Provider } from '../../shared/types'
import { parseModelId, resolveProvider } from '../router'

/** 将 snake_case ProviderRow 转换为 camelCase Provider，供 proxy 路由使用 */
function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type as 'anthropic' | 'openai',
    baseUrl: row.base_url,
    apiKey: row.api_key,
    models: JSON.parse(row.models) as string[],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

describe('parseModelId', () => {
  it('should parse "prefix/model" correctly', () => {
    const result = parseModelId('anthropic/claude-3-opus-20240229')
    expect(result).toEqual({
      prefix: 'anthropic',
      modelName: 'claude-3-opus-20240229'
    })
  })

  it('should parse complex prefix with dots and hyphens', () => {
    const result = parseModelId('my-custom-provider/gpt-4-turbo')
    expect(result).toEqual({
      prefix: 'my-custom-provider',
      modelName: 'gpt-4-turbo'
    })
  })

  it('should throw error for string without "/"', () => {
    expect(() => parseModelId('invalid-model-id')).toThrow('Failed to parse model ID: invalid format')
  })

  it('should throw error for empty string', () => {
    expect(() => parseModelId('')).toThrow('Failed to parse model ID: invalid format')
  })

  it('should parse model with slashes after prefix', () => {
    const result = parseModelId('provider/some/nested/path')
    expect(result).toEqual({
      prefix: 'provider',
      modelName: 'some/nested/path'
    })
  })
})

describe('resolveProvider', () => {
  let lookupProvider: (name: string) => Provider | undefined

  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()

    // Insert test provider
    createProvider({
      name: 'test-provider',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'encrypted-key-123',
      models: ['gpt-4', 'gpt-3.5-turbo']
    })

    // Insert provider that will be deactivated
    createProvider({
      name: 'inactive-provider',
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'encrypted-key-456',
      models: ['claude-3-opus-20240229']
    })

    // Mark inactive-provider as inactive
    const inactive = getProviderByName('inactive-provider')!
    updateProvider(inactive.id, { isActive: 0 })

    // 转换函数：将 snake_case ProviderRow 转为 camelCase Provider
    lookupProvider = (name: string) => {
      const row = getProviderByName(name)
      return row ? toProvider(row) : undefined
    }
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should resolve a valid model ID with active provider', () => {
    const result = resolveProvider('test-provider/gpt-4', lookupProvider)
    expect(result).toBeDefined()
    expect(result.prefix).toBe('test-provider')
    expect(result.modelName).toBe('gpt-4')
    expect(result.provider.name).toBe('test-provider')
    expect(result.provider.isActive).toBe(1)
  })

  it('should throw for non-existent provider prefix', () => {
    expect(() => resolveProvider('nonexistent/gpt-4', lookupProvider)).toThrow('Failed to resolve provider: provider not found')
  })

  it('should throw for inactive provider', () => {
    expect(() => resolveProvider('inactive-provider/claude-3-opus-20240229', lookupProvider)).toThrow('Failed to resolve provider: provider is disabled')
  })

  it('should throw for model not in provider models list', () => {
    expect(() => resolveProvider('test-provider/nonexistent-model', lookupProvider)).toThrow('Failed to resolve model: model not in provider whitelist')
  })

  it('should throw for invalid model ID format (no slash)', () => {
    expect(() => resolveProvider('no-slash-here', lookupProvider)).toThrow('Failed to parse model ID: invalid format')
  })

  it('should resolve model with slash in model name', () => {
    const result = resolveProvider('test-provider/gpt-4', lookupProvider)
    expect(result.modelName).toBe('gpt-4')
    expect(result.provider.name).toBe('test-provider')
  })
})
