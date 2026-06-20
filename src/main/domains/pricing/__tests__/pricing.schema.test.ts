// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createPricingSchema } from '../pricing.schema'

describe('createPricingSchema', () => {
  const validInput = {
    providerId: 1,
    model: 'gpt-4',
    priceInCached: 0.5,
    priceInUncached: 1.5,
    priceOut: 3.0
  }

  it('should accept valid pricing input', () => {
    const result = createPricingSchema.parse(validInput)
    expect(result.providerId).toBe(1)
    expect(result.model).toBe('gpt-4')
    expect(result.priceInCached).toBe(0.5)
    expect(result.priceInUncached).toBe(1.5)
    expect(result.priceOut).toBe(3.0)
  })

  it('should accept zero prices (free model)', () => {
    const result = createPricingSchema.parse({ ...validInput, priceInCached: 0, priceInUncached: 0, priceOut: 0 })
    expect(result.priceInCached).toBe(0)
  })

  it('should reject non-integer providerId', () => {
    expect(() => createPricingSchema.parse({ ...validInput, providerId: 1.5 })).toThrow()
  })

  it('should reject non-number providerId', () => {
    expect(() => createPricingSchema.parse({ ...validInput, providerId: '1' })).toThrow()
  })

  it('should reject empty model name', () => {
    expect(() => createPricingSchema.parse({ ...validInput, model: '' })).toThrow()
  })

  it('should reject missing model', () => {
    const { model: _model, ...rest } = validInput
    expect(() => createPricingSchema.parse(rest)).toThrow()
  })

  it('should reject negative priceInCached', () => {
    expect(() => createPricingSchema.parse({ ...validInput, priceInCached: -0.1 })).toThrow()
  })

  it('should reject negative priceInUncached', () => {
    expect(() => createPricingSchema.parse({ ...validInput, priceInUncached: -1 })).toThrow()
  })

  it('should reject negative priceOut', () => {
    expect(() => createPricingSchema.parse({ ...validInput, priceOut: -3.0 })).toThrow()
  })

  it('should reject non-number prices', () => {
    expect(() => createPricingSchema.parse({ ...validInput, priceOut: '3.0' })).toThrow()
  })

  it('should reject missing required fields', () => {
    expect(() => createPricingSchema.parse({})).toThrow()
  })
})
