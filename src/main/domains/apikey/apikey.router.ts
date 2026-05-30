import { Hono } from 'hono'
import type { ApiKeyService } from './apikey.service'

export function createApiKeyRouter(service: ApiKeyService) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const result = await service.create(body)
    return c.json(result, 201)
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  return router
}
