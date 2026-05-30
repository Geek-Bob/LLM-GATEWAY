import { resolveProvider } from '../../proxy/router'
import { buildProxyUrl, buildProxyHeaders } from '../../proxy/forwarder'
import { verifyApiKey } from '../../db/api-keys'
import { createLogger } from '../../core/logger'
import type { ChatChunk } from './chat.types'

const logger = createLogger('chat.service')

export function createChatService() {
  return {
    send: async function* (
      model: string,
      messages: { role: string; content: string }[],
      gatewayApiKey: string
    ): AsyncGenerator<ChatChunk> {
      // Validate gateway API key
      const keyRecord = verifyApiKey(gatewayApiKey)
      if (!keyRecord) {
        yield { text: 'Invalid gateway API key', done: true, error: 'Unauthorized' }
        return
      }

      // Resolve provider from model (throws on error, unlike template which checks null)
      let resolved
      try {
        resolved = resolveProvider(model)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        yield { text: message, done: true, error: message }
        return
      }

      // Use provider's own API key (stored in provider.apiKey),
      // not getApiKeyPlaintext(keyRecord.id) which returns the gateway key itself
      const providerApiKey = resolved.provider.apiKey
      if (!providerApiKey) {
        yield { text: 'Provider API key not configured', done: true, error: 'Internal error' }
        return
      }

      const providerType = resolved.provider.providerType
      const path = providerType === 'anthropic'
        ? '/v1/messages' : '/v1/chat/completions'
      const url = buildProxyUrl(resolved.provider, path)

      // buildProxyHeaders takes 3 args: provider, decryptedKey, originalHeaders
      const headers = buildProxyHeaders(resolved.provider, providerApiKey, {})

      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: resolved.modelName,
            messages,
            stream: true
          })
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Chat fetch error', { error: message })
        yield { text: message, done: true, error: message }
        return
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        yield { text: `Upstream returned ${response.status}: ${errBody}`, done: true, error: 'Upstream error' }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        yield { text: 'Response body is not readable', done: true, error: 'No body' }
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            // Parse SSE event name
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
              continue
            }

            // Parse SSE data
            if (!line.startsWith('data: ')) {
              if (line === '') currentEvent = ''
              continue
            }

            const dataStr = line.slice(6)

            // OpenAI [DONE] sentinel
            if (dataStr === '[DONE]') {
              yield { text: '', done: true }
              return
            }

            let data: Record<string, any>
            try {
              data = JSON.parse(dataStr)
            } catch {
              continue
            }

            if (providerType === 'openai') {
              // OpenAI SSE: data.choices[0].delta.content / reasoning_content
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                yield { text: delta.content, chunkType: 'text', done: false }
              }
              if (delta?.reasoning_content) {
                yield { text: delta.reasoning_content, chunkType: 'thinking', done: false }
              }
              if (data.choices?.[0]?.finish_reason) {
                yield { text: '', done: true }
                return
              }
            } else if (providerType === 'anthropic') {
              // Anthropic SSE: event-named messages with typed content blocks
              switch (currentEvent) {
                case 'content_block_start': {
                  const block = data.content_block
                  if (block?.type === 'text' && block.text) {
                    yield { text: block.text, chunkType: 'text', done: false }
                  } else if (block?.type === 'thinking' && block.thinking) {
                    yield { text: block.thinking, chunkType: 'thinking', done: false }
                  }
                  break
                }
                case 'content_block_delta': {
                  const delta = data.delta
                  if (delta?.type === 'text_delta' && delta.text) {
                    yield { text: delta.text, chunkType: 'text', done: false }
                  } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                    yield { text: delta.thinking, chunkType: 'thinking', done: false }
                  }
                  break
                }
                case 'message_stop':
                  yield { text: '', done: true }
                  return
              }
            } else {
              yield { text: `Unknown provider type: ${providerType}`, done: true, error: 'Unknown provider' }
              return
            }
          }

          // Reset event after empty line (SSE boundary)
        }

        // Stream ended without explicit done signal
        yield { text: '', done: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Chat stream error', { error: message })
        yield { text: message, done: true, error: message }
      }
    }
  }
}

export type ChatService = ReturnType<typeof createChatService>
