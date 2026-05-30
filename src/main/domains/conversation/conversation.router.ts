import { Hono } from 'hono'
import type { ConversationService } from './conversation.service'

export function createConversationRouter(service: ConversationService) {
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
    await service.update(id, await c.req.json())
    return c.json({ success: true })
  })

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await service.remove(id)
    return c.json({ success: true })
  })

  router.get('/:id/messages', async (c) => {
    const id = Number(c.req.param('id'))
    const msgs = await service.messages(id)
    return c.json(msgs)
  })

  router.post('/:id/messages', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const msgId = await service.addMessage({
      conversationId: id,
      role: body.role,
      content: body.content,
      thinking: body.thinking
    })
    return c.json({ id: msgId }, 201)
  })

  return router
}
