// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { initDatabase, closeDatabase, getDb } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderService } from '../provider.service'
import { createProviderRouter } from '../provider.router'

describe('createProviderRouter', () => {
  let app: Hono

  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()
    const service = createProviderService(getDb())
    app = new Hono()
    app.route('/v1/admin/providers', createProviderRouter(service))
  })

  afterAll(() => {
    closeDatabase()
  })

  it('GET / 返回空列表', async () => {
    const res = await app.request('/v1/admin/providers')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST / 创建 provider 返回 201', async () => {
    const res = await app.request('/v1/admin/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OpenAI', providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-key', models: ['gpt-4']
      })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('OpenAI')
  })
})
