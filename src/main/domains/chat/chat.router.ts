import { Hono } from 'hono'
import type { ChatService } from './chat.service'

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

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of service.send(model, messages, token)) {
            const data = JSON.stringify(chunk)
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            if (chunk.done) {
              controller.close()
              return
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ text: message, done: true, error: message })}\n\n`
            )
          )
          controller.close()
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  })

  return router
}
