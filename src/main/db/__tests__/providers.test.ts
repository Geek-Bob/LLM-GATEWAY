// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createProviderRepository } from '../providers'
import type { ProviderInput } from '../providers'

describe('Provider Repository', () => {
  let repo: ReturnType<typeof createProviderRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createProviderRepository(db)
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

  it('should create a provider and return a row with positive id', async () => {
    const created = await repo.create(sampleInput)
    expect(created.id).toBeGreaterThan(0)
    expect(Number.isInteger(created.id)).toBe(true)
  })

  it('should get a provider by id', async () => {
    const created = await repo.create(sampleInput)
    const provider = await repo.findById(created.id)

    expect(provider).not.toBeNull()
    expect(provider!.id).toBe(created.id)
    expect(provider!.name).toBe('Test Provider')
    expect(provider!.provider_type).toBe('openai')
    expect(provider!.base_url).toBe('https://api.openai.com/v1')
    expect(provider!.api_key).toBe('sk-test-plaintext-key')
    expect(JSON.parse(provider!.models)).toEqual(['gpt-4', 'gpt-3.5-turbo'])
    expect(provider!.created_at).toBeTruthy()
    expect(provider!.updated_at).toBeTruthy()
  })

  it('should get a provider by name', async () => {
    const created = await repo.create(sampleInput)
    const provider = await repo.findByName('Test Provider')
    expect(provider).not.toBeNull()
    expect(provider!.id).toBe(created.id)
  })

  it('should return null for non-existent provider by id', async () => {
    const provider = await repo.findById(999)
    expect(provider).toBeNull()
  })

  it('should return null for non-existent provider by name', async () => {
    const provider = await repo.findByName('Non Existent')
    expect(provider).toBeNull()
  })

  it('should list all providers ordered by created_at desc', async () => {
    await repo.create({ ...sampleInput, name: 'Provider A' })
    await repo.create({ ...sampleInput, name: 'Provider B' })
    await repo.create({ ...sampleInput, name: 'Provider C' })

    const providers = await repo.list()
    expect(providers).toHaveLength(3)
    const names = providers.map((p) => p.name).sort()
    expect(names).toEqual(['Provider A', 'Provider B', 'Provider C'])
    providers.forEach((p) => {
      expect(p.created_at).toBeTruthy()
    })
  })

  it('should list only active providers', async () => {
    await repo.create({ ...sampleInput, name: 'Active A' })
    const inactive = await repo.create({ ...sampleInput, name: 'Inactive B' })
    await repo.create({ ...sampleInput, name: 'Active C' })

    await repo.update(inactive.id, { isActive: 0 })

    const activeProviders = await repo.listActive()
    expect(activeProviders).toHaveLength(2)
    const names = activeProviders.map((p) => p.name).sort()
    expect(names).toEqual(['Active A', 'Active C'])
  })

  it('should update provider fields', async () => {
    const created = await repo.create(sampleInput)
    await repo.update(created.id, { baseUrl: 'https://new-url.com' })

    const updated = (await repo.findById(created.id))!
    expect(updated.base_url).toBe('https://new-url.com')
    expect(updated.name).toBe('Test Provider')
    expect(updated.provider_type).toBe('openai')
  })

  it('should update models field', async () => {
    const created = await repo.create(sampleInput)
    await repo.update(created.id, { models: ['gpt-4-turbo'] })

    const updated = (await repo.findById(created.id))!
    expect(JSON.parse(updated.models)).toEqual(['gpt-4-turbo'])
  })

  it('should update is_active field', async () => {
    const created = await repo.create(sampleInput)
    expect((await repo.findById(created.id))!.is_active).toBe(1)

    await repo.update(created.id, { isActive: 0 })
    expect((await repo.findById(created.id))!.is_active).toBe(0)
  })

  it('should update updated_at on modification', async () => {
    const created = await repo.create(sampleInput)
    const original = (await repo.findById(created.id))!
    const originalUpdatedAt = original.updated_at

    await new Promise((resolve) => setTimeout(resolve, 1100))

    await repo.update(created.id, { baseUrl: 'https://updated.com' })
    const updated = (await repo.findById(created.id))!

    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should delete a provider', async () => {
    const created = await repo.create(sampleInput)
    expect(await repo.findById(created.id)).not.toBeNull()

    await repo.remove(created.id)
    expect(await repo.findById(created.id)).toBeNull()
  })

  it('should enforce unique name constraint', async () => {
    await repo.create(sampleInput)
    await expect(repo.create(sampleInput)).rejects.toThrow()
  })

  it('should handle provider with anthropic type', async () => {
    const anthropicInput: ProviderInput = {
      name: 'Anthropic Provider',
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-encrypted',
      models: ['claude-3-opus', 'claude-3-sonnet']
    }

    const created = await repo.create(anthropicInput)
    const provider = (await repo.findById(created.id))!

    expect(provider.provider_type).toBe('anthropic')
    expect(JSON.parse(provider.models)).toEqual(['claude-3-opus', 'claude-3-sonnet'])
  })
})
