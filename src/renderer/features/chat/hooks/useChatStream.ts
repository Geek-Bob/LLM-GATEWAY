import { useState, useRef, useCallback } from 'react'
import { apiFetch, getApiKey } from '@/shared/lib/api-client'

interface StreamMessage {
  id: string
  role: 'assistant'
  content: string
  thinking?: string
  isThinking: boolean
  isStreaming: boolean
  error: boolean
}

interface UseChatStreamReturn {
  send: (model: string, providerType: 'anthropic' | 'openai', messages: { role: string; content: string }[]) => Promise<void>
  abort: () => void
  message: StreamMessage | null
  isLoading: boolean
  error: string | null
}

export function useChatStream(onUpdate: (msg: StreamMessage) => void): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messageRef = useRef<StreamMessage | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
  }, [])

  const send = useCallback(async (
    model: string,
    providerType: 'anthropic' | 'openai',
    messages: { role: string; content: string }[]
  ) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('No API key configured')
      return
    }

    const abortController = new AbortController()
    abortRef.current = abortController
    setIsLoading(true)
    setError(null)

    const msgId = crypto.randomUUID()
    const initialMsg: StreamMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      thinking: '',
      isThinking: true,
      isStreaming: true,
      error: false,
    }
    messageRef.current = initialMsg
    onUpdate(initialMsg)

    try {
      const response = await apiFetch('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model, messages, stream: true }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        const errorMsg: StreamMessage = {
          ...messageRef.current!,
          content: `Error ${response.status}: ${errorText}`,
          isStreaming: false,
          isThinking: false,
          error: true,
        }
        messageRef.current = errorMsg
        onUpdate(errorMsg)
        setError(errorText)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let contentAcc = ''
      let thinkingAcc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.done) {
              const doneMsg: StreamMessage = {
                ...messageRef.current!,
                content: contentAcc,
                thinking: thinkingAcc,
                isStreaming: false,
                isThinking: false,
              }
              messageRef.current = doneMsg
              onUpdate(doneMsg)
              return
            }

            if (parsed.chunkType === 'thinking') {
              thinkingAcc += parsed.text
            } else {
              contentAcc += parsed.text || ''
            }

            const updatedMsg: StreamMessage = {
              ...messageRef.current!,
              content: contentAcc,
              thinking: thinkingAcc,
              isThinking: parsed.chunkType === 'thinking',
            }
            messageRef.current = updatedMsg
            onUpdate(updatedMsg)
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      if (messageRef.current) {
        const errorMsg: StreamMessage = {
          ...messageRef.current,
          content: message,
          isStreaming: false,
          isThinking: false,
          error: true,
        }
        messageRef.current = errorMsg
        onUpdate(errorMsg)
      }
    } finally {
      abortRef.current = null
      setIsLoading(false)
    }
  }, [onUpdate])

  return { send, abort, message: messageRef.current, isLoading, error }
}
