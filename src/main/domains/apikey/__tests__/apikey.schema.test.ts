// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createApiKeySchema } from '../apikey.schema'

describe('createApiKeySchema', () => {
  it('should accept valid input', () => {
    const result = createApiKeySchema.parse({ name: 'My Key', rateLimit: 60 })
    expect(result.name).toBe('My Key')
    expect(result.rateLimit).toBe(60)
  })

  it('should accept input without rateLimit (optional)', () => {
    const result = createApiKeySchema.parse({ name: 'My Key' })
    expect(result.rateLimit).toBeUndefined()
  })

  it('should reject empty name', () => {
    expect(() => createApiKeySchema.parse({ name: '' })).toThrow()
  })

  it('should reject negative rateLimit', () => {
    expect(() => createApiKeySchema.parse({ name: 'Key', rateLimit: -1 })).toThrow()
  })
})
