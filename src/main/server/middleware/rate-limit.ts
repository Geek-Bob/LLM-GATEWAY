import type { MiddlewareHandler } from 'hono'

interface RateEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(maxPerMinute: number = 60): MiddlewareHandler {
  const store = new Map<string, RateEntry>()

  // Periodic cleanup every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 300000)

  // Allow cleanup in tests
  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).__rateLimitCleanup = () => clearInterval(cleanupInterval)
  }

  return async (c, next) => {
    const key = c.get('apiKey') as { id: number; name: string } | undefined
    const clientId = key?.name ?? c.req.header('x-forwarded-for') ?? 'unknown'
    const now = Date.now()

    let entry = store.get(clientId)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 }
      store.set(clientId, entry)
    }

    entry.count++
    if (entry.count > maxPerMinute) {
      return c.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }, 429)
    }

    await next()
  }
}
