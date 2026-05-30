import type { ChatChunk } from './chat.types'

export function createSSEResponse(generator: AsyncGenerator<ChatChunk>): Response {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const data = JSON.stringify(chunk)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          if (chunk.done) { controller.close(); return }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: message, done: true, error: message })}\n\n`))
        controller.close()
      }
    }
  })
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  })
}
