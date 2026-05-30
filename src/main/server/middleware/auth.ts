import type { MiddlewareHandler } from 'hono'
import { verifyApiKey } from '../../db/api-keys'

export function createAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')
    const apiKeyHeader = c.req.header('X-Api-Key')

    let token = ''
    if (authHeader) {
      token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader
    } else if (apiKeyHeader) {
      token = apiKeyHeader
    } else {
      return c.json({ error: 'Missing Authorization or X-Api-Key header' }, 401)
    }

    const key = verifyApiKey(token)
    if (!key) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    c.set('apiKey', key)
    await next()
  }
}
