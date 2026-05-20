// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createProvider, getProviderByName, updateProvider } from '../../db/providers'
import { parseModelId, resolveProvider, getAllModels } from '../router'

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
    expect(() => parseModelId('invalid-model-id')).toThrow('Invalid model ID format')
  })

  it('should throw error for empty string', () => {
    expect(() => parseModelId('')).toThrow('Invalid model ID format')
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
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should resolve a valid model ID with active provider', () => {
    const result = resolveProvider('test-provider/gpt-4')
    expect(result).toBeDefined()
    expect(result.prefix).toBe('test-provider')
    expect(result.modelName).toBe('gpt-4')
    expect(result.provider.name).toBe('test-provider')
    expect(result.provider.isActive).toBe(1)
  })

  it('should throw for non-existent provider prefix', () => {
    expect(() => resolveProvider('nonexistent/gpt-4')).toThrow('Provider not found')
  })

  it('should throw for inactive provider', () => {
    expect(() => resolveProvider('inactive-provider/claude-3-opus-20240229')).toThrow('not active')
  })

  it('should throw for model not in provider models list', () => {
    expect(() => resolveProvider('test-provider/nonexistent-model')).toThrow('not found')
  })

  it('should throw for invalid model ID format (no slash)', () => {
    expect(() => resolveProvider('no-slash-here')).toThrow('Invalid model ID format')
  })

  it('should resolve model with slash in model name', () => {
    const result = resolveProvider('test-provider/gpt-4')
    expect(result.modelName).toBe('gpt-4')
    expect(result.provider.name).toBe('test-provider')
  })
})

describe('getAllModels', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()

    createProvider({
      name: 'provider-a',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'key-a',
      models: ['gpt-4', 'gpt-3.5-turbo']
    })

    createProvider({
      name: 'provider-b',
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'key-b',
      models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229']
    })
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should return all model combinations from active providers', () => {
    const models = getAllModels()
    expect(models).toHaveLength(4)

    expect(models).toContainEqual({
      id: 'provider-a/gpt-4',
      provider: 'provider-a',
      providerType: 'openai'
    })
    expect(models).toContainEqual({
      id: 'provider-a/gpt-3.5-turbo',
      provider: 'provider-a',
      providerType: 'openai'
    })
    expect(models).toContainEqual({
      id: 'provider-b/claude-3-opus-20240229',
      provider: 'provider-b',
      providerType: 'anthropic'
    })
    expect(models).toContainEqual({
      id: 'provider-b/claude-3-sonnet-20240229',
      provider: 'provider-b',
      providerType: 'anthropic'
    })
  })

  it('should return empty array when no active providers exist', async () => {
    closeDatabase()
    await initDatabase(':memory:')
    createTables()

    // Create only inactive provider
    createProvider({
      name: 'inactive-only',
      providerType: 'openai',
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      models: ['model-1']
    })
    const p = getProviderByName('inactive-only')!
    updateProvider(p.id, { isActive: 0 })

    const models = getAllModels()
    expect(models).toHaveLength(0)
  })

  it('should not include inactive provider models', () => {
    // Deactivate provider-b
    const p = getProviderByName('provider-b')!
    updateProvider(p.id, { isActive: 0 })

    const models = getAllModels()
    expect(models).toHaveLength(2)
    expect(models.every(m => m.provider === 'provider-a')).toBe(true)
  })
})
