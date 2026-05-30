import { Hono } from 'hono'
import type { ChatService } from './chat.service'
import { createSSEResponse } from './chat.stream'

export function createChatRouter(service: ChatService) {
  const router = new Hono()

  router.post('/completions', async (c) => {
    const body = await c.req.json()
    const { model, messages, stream = false } = body
    const authHeader = c.req.header('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    if (!stream) {
      return c.json({ error: 'Non-streaming not yet supported' }, 501)
    }

    return createSSEResponse(service.send(model, messages, token))
  })

  return router
}
