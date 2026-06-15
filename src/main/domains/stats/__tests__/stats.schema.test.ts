// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { statsQuerySchema } from '../stats.schema'

describe('statsQuerySchema', () => {
  describe('合法输入', () => {
    it('should accept "24h"', () => {
      const result = statsQuerySchema.parse({ range: '24h' })
      expect(result.range).toBe('24h')
    })

    it('should accept "7d"', () => {
      const result = statsQuerySchema.parse({ range: '7d' })
      expect(result.range).toBe('7d')
    })

    it('should accept "30d"', () => {
      const result = statsQuerySchema.parse({ range: '30d' })
      expect(result.range).toBe('30d')
    })
  })

  describe('默认值', () => {
    it('should default to "7d" when range is omitted', () => {
      const result = statsQuerySchema.parse({})
      expect(result.range).toBe('7d')
    })

    it('should default to "7d" when input is empty object', () => {
      const result = statsQuerySchema.parse({})
      expect(result).toEqual({ range: '7d' })
    })
  })

  describe('非法输入', () => {
    it('should reject "1h" (invalid range)', () => {
      expect(() => statsQuerySchema.parse({ range: '1h' })).toThrow()
    })

    it('should reject "90d" (invalid range)', () => {
      expect(() => statsQuerySchema.parse({ range: '90d' })).toThrow()
    })

    it('should reject empty string', () => {
      expect(() => statsQuerySchema.parse({ range: '' })).toThrow()
    })

    it('should reject numeric range', () => {
      expect(() => statsQuerySchema.parse({ range: 7 })).toThrow()
    })

    it('should reject null range', () => {
      expect(() => statsQuerySchema.parse({ range: null })).toThrow()
    })
  })
})
