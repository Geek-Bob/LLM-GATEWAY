/**
 * Chat 流式对话 Hook
 *
 * 职责：根据 providerType 分路由到标准代理端点，消费 LLM 的流式响应。
 *
 * 架构说明：
 * - 这是唯一走 HTTP 请求的模块（非 IPC），因为 Chat 流需要经过本地 proxy 验证代理能力
 * - providerType='openai' → POST /v1/chat/completions → 解析 OpenAI SSE
 * - providerType='anthropic' → POST /v1/messages → 解析 Anthropic SSE
 * - proxy 的 handleProxyRequest 负责透明协议转换（convertRequest + convertSSEEvent）
 * - 详见 .claude/rules/00-core.md "业务 CRUD 全部走 IPC，Chat 对话流走 HTTP" 的约定
 *
 * SSE 数据消费流程：
 * 1. 通过 fetch + ReadableStream 建立持久连接
 * 2. 每个 chunk 解码后按 '\n' 分割行
 * 3. 根据端点类型解析不同的 SSE 格式：
 *    - OpenAI: 过滤 'data: ' 前缀行 → JSON.parse → delta.content / delta.reasoning_content
 *    - Anthropic: 过滤 'event: ' / 'data: ' 前缀行 → 对应事件类型解析
 * 4. content 累加到 contentAcc，thinking 累加到 thinkingAcc
 * 5. 每次更新都通过 onUpdate 回调通知父组件，父组件驱动 React 重渲染
 *
 * 中止机制：
 * - AbortController 用于中止 fetch 请求
 * - reader.cancel() 用于关闭已打开的 ReadableStream
 * - DOMException AbortError 在 catch 中被静默忽略，不触发错误状态
 */
import { useState, useRef, useCallback } from 'react'
import { apiFetch, getApiKey } from '@/shared/lib/api-client'

export interface StreamMessage {
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
  isLoading: boolean
  error: string | null
}

export function useChatStream(onUpdate: (msg: StreamMessage) => void): UseChatStreamReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const messageRef = useRef<StreamMessage | null>(null)

  /**
   * 中止当前流式请求
   * 同时中止 fetch（AbortController）和 ReadableStream（reader.cancel）
   */
  const abort = useCallback(() => {
    abortRef.current?.abort()
    readerRef.current?.cancel().catch(() => {})
    abortRef.current = null
    readerRef.current = null
    setIsLoading(false)
  }, [])

  /** 获取 SSE 端点路径 */
  function getEndpoint(providerType: 'anthropic' | 'openai'): string {
    return providerType === 'anthropic' ? '/v1/messages' : '/v1/chat/completions'
  }

  /** 构建请求体 — Anthropic 额外需要 max_tokens */
  function buildRequestBody(
    model: string,
    messages: { role: string; content: string }[],
    providerType: 'anthropic' | 'openai'
  ): string {
    const body: Record<string, any> = { model, messages, stream: true }
    if (providerType === 'anthropic') {
      body.max_tokens = 4096
    }
    return JSON.stringify(body)
  }

  /** 构造流结束消息 */
  function buildDoneMessage(content: string, thinking: string): StreamMessage {
    return {
      ...messageRef.current!,
      content,
      thinking,
      isStreaming: false,
      isThinking: false,
    }
  }

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

    // 发送初始消息占位，触发 UI 显示加载状态
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
      const endpoint = getEndpoint(providerType)
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: buildRequestBody(model, messages, providerType),
        signal: abortController.signal,
      })

      // 处理 HTTP 层面的错误（如 401/403/500）
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
      readerRef.current = reader

      const decoder = new TextDecoder()
      let buffer = ''
      let contentAcc = ''
      let thinkingAcc = ''
      // Anthropic SSE 使用命名事件，需追踪当前事件类型
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            // 空行在 Anthropic SSE 中表示事件分隔
            if (providerType === 'anthropic') currentEvent = ''
            continue
          }

          if (providerType === 'openai') {
            // --- OpenAI SSE 解析 ---
            // 格式: data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
            // 格式: data: [DONE]
            if (!trimmed.startsWith('data: ')) continue

            const jsonStr = trimmed.slice(6)
            if (jsonStr === '[DONE]') {
              const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
              messageRef.current = doneMsg
              onUpdate(doneMsg)
              return
            }

            let parsed: any
            try { parsed = JSON.parse(jsonStr) } catch { continue }

            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            if (delta.content) {
              contentAcc += delta.content
            }
            if (delta.reasoning_content) {
              thinkingAcc += delta.reasoning_content
            }

            const updatedMsg: StreamMessage = {
              ...messageRef.current!,
              content: contentAcc,
              thinking: thinkingAcc,
              isThinking: !!delta.reasoning_content,
            }
            messageRef.current = updatedMsg
            onUpdate(updatedMsg)

            // finish_reason 出现表示这是最后一个有意义 chunk
            if (parsed.choices?.[0]?.finish_reason) {
              const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
              messageRef.current = doneMsg
              onUpdate(doneMsg)
              return
            }
          } else {
            // --- Anthropic SSE 解析 ---
            // 格式: event: content_block_delta
            //       data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.slice(7).trim()
              continue
            }
            if (!trimmed.startsWith('data: ')) continue

            const jsonStr = trimmed.slice(6)
            let data: any
            try { data = JSON.parse(jsonStr) } catch { continue }

            switch (currentEvent) {
              case 'content_block_start': {
                const block = data.content_block
                if (block?.type === 'text' && block.text) {
                  contentAcc += block.text
                } else if (block?.type === 'thinking' && block.thinking) {
                  thinkingAcc += block.thinking
                }
                if (contentAcc || thinkingAcc) {
                  const updatedMsg: StreamMessage = {
                    ...messageRef.current!,
                    content: contentAcc,
                    thinking: thinkingAcc,
                    isThinking: block?.type === 'thinking',
                  }
                  messageRef.current = updatedMsg
                  onUpdate(updatedMsg)
                }
                break
              }
              case 'content_block_delta': {
                const delta = data.delta
                if (delta?.type === 'text_delta' && delta.text) {
                  contentAcc += delta.text
                } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                  thinkingAcc += delta.thinking
                }
                if (contentAcc || thinkingAcc) {
                  const updatedMsg: StreamMessage = {
                    ...messageRef.current!,
                    content: contentAcc,
                    thinking: thinkingAcc,
                    isThinking: delta?.type === 'thinking_delta',
                  }
                  messageRef.current = updatedMsg
                  onUpdate(updatedMsg)
                }
                break
              }
              case 'message_delta': {
                // stop_reason 出现，流即将结束 — 不做特殊处理
                break
              }
              case 'message_stop': {
                const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
                messageRef.current = doneMsg
                onUpdate(doneMsg)
                return
              }
            }
          }
        }
      }

      // 流自然结束但未收到明确终止信号（兜底）
      const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
      messageRef.current = doneMsg
      onUpdate(doneMsg)
    } catch (err) {
      // AbortError 是主动中止的正常行为，不视为错误
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
      readerRef.current?.cancel()?.catch(() => {})
      readerRef.current = null
      setIsLoading(false)
    }
  }, [onUpdate])

  return { send, abort, isLoading, error }
}
