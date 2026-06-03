// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createProviderSchema, updateProviderSchema } from '../provider.schema'

describe('createProviderSchema', () => {
  it('should accept valid provider input', () => {
    const input = {
      name: 'Test Provider',
      providerType: 'openai' as const,
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test-key',
      models: ['gpt-4']
    }
    const result = createProviderSchema.parse(input)
    expect(result.name).toBe('Test Provider')
    expect(result.models).toEqual(['gpt-4'])
  })

  it('should reject missing name', () => {
    const input = { providerType: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject invalid providerType', () => {
    const input = { name: 'Test', providerType: 'gemini', baseUrl: 'https://api.example.com', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject empty models array', () => {
    const input = { name: 'Test', providerType: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-key', models: [] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })

  it('should reject non-URL baseUrl', () => {
    const input = { name: 'Test', providerType: 'openai', baseUrl: 'not-a-url', apiKey: 'sk-key', models: ['gpt-4'] }
    expect(() => createProviderSchema.parse(input)).toThrow()
  })
})

describe('updateProviderSchema', () => {
  it('should accept partial update', () => {
    const result = updateProviderSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  it('should accept empty object (all fields optional)', () => {
    const result = updateProviderSchema.parse({})
    expect(result).toEqual({})
  })

  it('should reject invalid providerType in partial update', () => {
    expect(() => updateProviderSchema.parse({ providerType: 'gemini' })).toThrow()
  })
})
