// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow requests within limit', () => {
    const limiter = new RateLimiter(1000)

    for (let i = 0; i < 5; i++) {
      const result = limiter.check('test-key', 5)
      expect(result.isAllowed).toBe(true)
      expect(result.remaining).toBe(5 - i - 1)
    }
  })

  it('should block requests exceeding limit', () => {
    const limiter = new RateLimiter(1000)

    for (let i = 0; i < 5; i++) {
      limiter.check('test-key', 5)
    }

    const result = limiter.check('test-key', 5)
    expect(result.isAllowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(typeof result.resetAt).toBe('number')
  })

  it('should have separate counters per key', () => {
    const limiter = new RateLimiter(1000)

    // Exhaust key1
    for (let i = 0; i < 5; i++) {
      limiter.check('key1', 5)
    }

    // key2 should still be fully available
    expect(limiter.check('key2', 5).isAllowed).toBe(true)
    expect(limiter.check('key2', 5).remaining).toBe(3)

    // key1 should be blocked
    expect(limiter.check('key1', 5).isAllowed).toBe(false)
  })

  it('should expire old entries after window', () => {
    const limiter = new RateLimiter(1000)

    for (let i = 0; i < 5; i++) {
      limiter.check('test-key', 5)
    }

    // Should be blocked
    expect(limiter.check('test-key', 5).isAllowed).toBe(false)

    // Advance time past the window
    vi.advanceTimersByTime(1000)

    // Should be allowed again
    const result = limiter.check('test-key', 5)
    expect(result.isAllowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should report correct resetAt for blocked requests', () => {
    const limiter = new RateLimiter(5000)

    // Make 5 rapid requests
    for (let i = 0; i < 5; i++) {
      limiter.check('test-key', 5)
    }

    const now = Date.now()
    const result = limiter.check('test-key', 5)

    expect(result.isAllowed).toBe(false)
    // resetAt should be oldest timestamp + windowMs
    expect(result.resetAt).toBe(now + 5000)
  })

  it('should use default 60s window when not specified', () => {
    const limiter = new RateLimiter()

    // Access internal windowMs via behavior — after 60s entries should expire
    limiter.check('default-key', 1)
    expect(limiter.check('default-key', 1).isAllowed).toBe(false)

    vi.advanceTimersByTime(60000)

    expect(limiter.check('default-key', 1).isAllowed).toBe(true)
  })

  it('should handle multiple keys independently with different limits', () => {
    const limiter = new RateLimiter(1000)

    // key1 has limit 3, key2 has limit 5
    for (let i = 0; i < 3; i++) {
      expect(limiter.check('key-low', 3).isAllowed).toBe(true)
    }
    // key1 should now be blocked at limit 3
    expect(limiter.check('key-low', 3).isAllowed).toBe(false)

    // key2 should still allow up to 5
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('key-high', 5).isAllowed).toBe(true)
    }
    expect(limiter.check('key-high', 5).isAllowed).toBe(false)
  })

  it('should allow requests again immediately after window passes for blocked key', () => {
    const limiter = new RateLimiter(500)

    for (let i = 0; i < 3; i++) {
      limiter.check('burst-key', 3)
    }

    // Blocked
    expect(limiter.check('burst-key', 3).isAllowed).toBe(false)

    // Advance just past the window
    vi.advanceTimersByTime(501)

    // Should be allowed again
    expect(limiter.check('burst-key', 3).isAllowed).toBe(true)
    expect(limiter.check('burst-key', 3).remaining).toBe(1)
  })
})
