import { describe, it, expect } from 'vitest'
import { authMiddleware } from '../middleware'

describe('authMiddleware', () => {
  it('should extract Bearer token from valid header', () => {
    const result = authMiddleware('Bearer my-token-123')
    expect(result).toBe('my-token-123')
  })

  it('should extract Bearer token with special characters', () => {
    const result = authMiddleware('Bearer sk-test-key-12345!@#$%')
    expect(result).toBe('sk-test-key-12345!@#$%')
  })

  it('should return null when header is undefined', () => {
    const result = authMiddleware(undefined)
    expect(result).toBeNull()
  })

  it('should return null when header is empty string', () => {
    const result = authMiddleware('')
    expect(result).toBeNull()
  })

  it('should return null when scheme is not Bearer', () => {
    const result = authMiddleware('Basic dXNlcjpwYXNz')
    expect(result).toBeNull()
  })

  it('should return null when only "Bearer" without trailing space', () => {
    const result = authMiddleware('Bearer')
    expect(result).toBeNull()
  })

  it('should return null when Bearer token is empty (just "Bearer ")', () => {
    const result = authMiddleware('Bearer ')
    expect(result).toBeNull()
  })

  it('should return raw token for Bearer followed by whitespace-only', () => {
    // The function does not trim — it returns whatever comes after "Bearer "
    const result = authMiddleware('Bearer   ')
    expect(result).toBe('  ')
  })
})
