import type { MiddlewareHandler } from 'hono'
import { verifyApiKey } from '../../db/api-keys'

export function createAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401)
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader

    const key = verifyApiKey(token)
    if (!key) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    c.set('apiKey', key)
    await next()
  }
}
