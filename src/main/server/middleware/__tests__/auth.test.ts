import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { createAuthMiddleware } from '../auth'

vi.mock('../../../db/api-keys', () => ({
  verifyApiKey: vi.fn((key: string) => {
    if (key === 'sk-valid-test-key') return { id: 1, name: 'test-key', rate_limit: 60, key_prefix: 'sk-valid', is_active: 1, created_at: '' }
    return null
  })
}))

describe('auth middleware', () => {
  it('无 Authorization header 返回 401', async () => {
    const app = new Hono()
    app.use('/v1/*', createAuthMiddleware())
    app.get('/v1/test', (c) => c.text('ok'))

    const res = await app.request('/v1/test')
    expect(res.status).toBe(401)
  })

  it('有效 API key 通过并设置 context', async () => {
    const app = new Hono()
    app.use('/v1/*', createAuthMiddleware())
    app.get('/v1/test', (c) => {
      const key = c.get('apiKey')
      return c.json(key)
    })

    const res = await app.request('/v1/test', {
      headers: { Authorization: 'Bearer sk-valid-test-key' }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
  })
})
