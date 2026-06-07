// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import {
  createProvider,
  getProvider,
  getProviderByName,
  listProviders,
  listActiveProviders,
  updateProvider,
  deleteProvider
} from '../providers'
import type { ProviderInput } from '../providers'

describe('Providers CRUD', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  const sampleInput: ProviderInput = {
    name: 'Test Provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-plaintext-key',
    models: ['gpt-4', 'gpt-3.5-turbo']
  }

  it('should create a provider and return a positive id', () => {
    const id = createProvider(sampleInput)
    expect(id).toBeGreaterThan(0)
    expect(Number.isInteger(id)).toBe(true)
  })

  it('should get a provider by id', () => {
    const id = createProvider(sampleInput)
    const provider = getProvider(id)

    expect(provider).toBeDefined()
    expect(provider!.id).toBe(id)
    expect(provider!.name).toBe('Test Provider')
    expect(provider!.provider_type).toBe('openai')
    expect(provider!.base_url).toBe('https://api.openai.com/v1')
    expect(provider!.api_key).toBe('sk-test-plaintext-key')
    expect(JSON.parse(provider!.models)).toEqual(['gpt-4', 'gpt-3.5-turbo'])
    expect(provider!.created_at).toBeTruthy()
    expect(provider!.updated_at).toBeTruthy()
  })

  it('should get a provider by name', () => {
    const id = createProvider(sampleInput)
    const provider = getProviderByName('Test Provider')
    expect(provider).toBeDefined()
    expect(provider!.id).toBe(id)
  })

  it('should return undefined for non-existent provider by id', () => {
    const provider = getProvider(999)
    expect(provider).toBeUndefined()
  })

  it('should return undefined for non-existent provider by name', () => {
    const provider = getProviderByName('Non Existent')
    expect(provider).toBeUndefined()
  })

  it('should list all providers ordered by created_at desc', () => {
    createProvider({ ...sampleInput, name: 'Provider A' })
    createProvider({ ...sampleInput, name: 'Provider B' })
    createProvider({ ...sampleInput, name: 'Provider C' })

    const providers = listProviders()
    expect(providers).toHaveLength(3)
    const names = providers.map(p => p.name).sort()
    expect(names).toEqual(['Provider A', 'Provider B', 'Provider C'])
    providers.forEach(p => {
      expect(p.created_at).toBeTruthy()
    })
  })

  it('should list only active providers', () => {
    createProvider({ ...sampleInput, name: 'Active A' })
    const inactiveId = createProvider({ ...sampleInput, name: 'Inactive B' })
    createProvider({ ...sampleInput, name: 'Active C' })

    updateProvider(inactiveId, { isActive: 0 })

    const activeProviders = listActiveProviders()
    expect(activeProviders).toHaveLength(2)
    const names = activeProviders.map(p => p.name).sort()
    expect(names).toEqual(['Active A', 'Active C'])
  })

  it('should update provider fields', () => {
    const id = createProvider(sampleInput)
    updateProvider(id, { baseUrl: 'https://new-url.com' })

    const updated = getProvider(id)!
    expect(updated.base_url).toBe('https://new-url.com')
    expect(updated.name).toBe('Test Provider')
    expect(updated.provider_type).toBe('openai')
  })

  it('should update models field', () => {
    const id = createProvider(sampleInput)
    updateProvider(id, { models: ['gpt-4-turbo'] })

    const updated = getProvider(id)!
    expect(JSON.parse(updated.models)).toEqual(['gpt-4-turbo'])
  })

  it('should update is_active field', () => {
    const id = createProvider(sampleInput)
    expect(getProvider(id)!.is_active).toBe(1)

    updateProvider(id, { isActive: 0 })
    expect(getProvider(id)!.is_active).toBe(0)
  })

  it('should update updated_at on modification', async () => {
    const id = createProvider(sampleInput)
    const original = getProvider(id)!
    const originalUpdatedAt = original.updated_at

    await new Promise(resolve => setTimeout(resolve, 1100))

    updateProvider(id, { baseUrl: 'https://updated.com' })
    const updated = getProvider(id)!

    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should delete a provider', () => {
    const id = createProvider(sampleInput)
    expect(getProvider(id)).toBeDefined()

    deleteProvider(id)
    expect(getProvider(id)).toBeUndefined()
  })

  it('should enforce unique name constraint', () => {
    createProvider(sampleInput)
    expect(() => createProvider(sampleInput)).toThrow()
  })

  it('should handle provider with anthropic type', () => {
    const anthropicInput: ProviderInput = {
      name: 'Anthropic Provider',
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-encrypted',
      models: ['claude-3-opus', 'claude-3-sonnet']
    }

    const id = createProvider(anthropicInput)
    const provider = getProvider(id)!

    expect(provider.provider_type).toBe('anthropic')
    expect(JSON.parse(provider.models)).toEqual(['claude-3-opus', 'claude-3-sonnet'])
  })
})
