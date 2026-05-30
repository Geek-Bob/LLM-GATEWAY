import type { MiddlewareHandler } from 'hono'

interface RateEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(maxPerMinute: number = 60): MiddlewareHandler {
  const store = new Map<string, RateEntry>()

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
