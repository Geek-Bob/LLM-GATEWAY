/**
 * Chat 流式对话 Hook
 *
 * 职责：调用标准代理端点 /v1/chat/completions，消费 OpenAI 格式的 SSE 流式响应。
 * 后端 proxy 自动处理与上游供应商（Anthropic 等）的协议转换，前端无需感知。
 *
 * 架构说明：
 * - 这是唯一走 HTTP 请求的模块（非 IPC），因为 Chat 流需要经过本地 proxy 验证代理能力
 * - 统一 POST /v1/chat/completions → 解析 OpenAI SSE
 * - proxy 的 handleProxyRequest 负责透明协议转换（convertRequest + convertSSEEvent）
 * - 详见 .claude/rules/00-core.md "业务 CRUD 全部走 IPC，Chat 对话流走 HTTP" 的约定
 *
 * SSE 数据消费流程：
 * 1. 通过 fetch + ReadableStream 建立持久连接
 * 2. 每个 chunk 解码后按 '\n' 分割行
 * 3. 解析 OpenAI SSE 格式：
 *    - 过滤 'data: ' 前缀行 → JSON.parse → delta.content / delta.reasoning_content
 * 4. content 累加到 contentAcc，thinking 累加到 thinkingAcc
 * 5. 每次更新都通过 onUpdate 回调通知父组件，父组件驱动 React 重渲染
 *
 * 中止机制：
 * - AbortController 用于中止 fetch 请求
 * - reader.cancel() 用于关闭已打开的 ReadableStream
 * - DOMException AbortError 在 catch 中被静默忽略，不触发错误状态
 */
import { useState, useRef, useCallback } from 'react'
import { apiFetch, getApiKey, ApiError } from '@/shared/lib/api-client'

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
  send: (model: string, messages: { role: string; content: string }[]) => Promise<void>
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

  /** 构建请求体 */
  function buildRequestBody(
    model: string,
    messages: { role: string; content: string }[]
  ): string {
    const body: Record<string, any> = { model, messages, stream: true }
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
      const endpoint = '/v1/chat/completions'
      // apiFetch 非 2xx 时会抛出 ApiError，错误在 catch 块中统一处理
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: buildRequestBody(model, messages),
        signal: abortController.signal,
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      readerRef.current = reader

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
          if (!trimmed) continue

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
        }
      }

      // 流自然结束但未收到明确终止信号（兜底）
      const doneMsg = buildDoneMessage(contentAcc, thinkingAcc)
      messageRef.current = doneMsg
      onUpdate(doneMsg)
    } catch (err) {
      // AbortError 是主动中止的正常行为，不视为错误
      if (err instanceof DOMException && err.name === 'AbortError') return
      // ApiError 包含上游返回的完整错误信息，优先提取 error.message
      let message: string
      if (err instanceof ApiError) {
        const body = err.body as Record<string, any>
        const upstream = body?.error
        message = typeof upstream === 'string'
          ? upstream
          : upstream?.message || err.message
      } else {
        message = err instanceof Error ? err.message : String(err)
      }
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
