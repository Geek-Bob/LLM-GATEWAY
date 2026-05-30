import { Hono } from 'hono'
import type { ProviderService } from './provider.service'

export function createProviderRouter(service: ProviderService) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const item = await service.getById(id)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const id = await service.create(body)
    const item = await service.getById(id)
    return c.json(item, 201)
  })

  router.put('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    await service.update(id, body)
    return c.json({ success: true })
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  return router
}
