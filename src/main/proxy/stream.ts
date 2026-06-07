/**
 * proxy/stream.ts — SSE 流协议转换
 *
 * 职责：
 * 1. sanitizeResponseHeaders() — 清理上游响应头，移除传输编码相关头
 * 2. convertSSEStream() — 将上游 SSE 事件流从一种格式实时转换为另一种格式
 *
 * 转换过程：
 *   1. 逐块读取上游流，缓冲不完整的行
 *   2. 按行解析 SSE 协议（event: / data: 字段）
 *   3. 调用 convertSSEEvent 逐事件转换格式
 *   4. 将转换后的事件编码为 SSE 文本推送给客户端
 *   5. 处理流结束（OpenAI [DONE] 标记 / Anthropic message_stop 事件）
 */

import { convertSSEEvent, createStreamContext, type StreamContext } from './converter'
import { createLogger } from '../core/logger'

const logger = createLogger('proxy:stream')

/**
 * 清理上游响应头，移除传输编码相关的头
 *
 * Node.js fetch 自动解压 Brotli/gzip 响应，response.body 已是解压后的数据。
 * 若原样转发 content-encoding / content-length / transfer-encoding，
 * 客户端会尝试再次解压已解压的数据，导致流损坏并抛出 "network error"。
 */
export function sanitizeResponseHeaders(headers: Headers): Record<string, string> {
  const cleaned: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') return
    cleaned[key] = value
  })
  return cleaned
}

/**
 * 创建 SSE 流转换服务
 *
 * @param deps - 注入的依赖
 * @param deps.createStreamContext - 创建流转换上下文
 * @param deps.convertSSEEvent - 转换单个 SSE 事件
 */
export function createStreamService(deps: {
  createStreamContext: typeof createStreamContext
  convertSSEEvent: typeof convertSSEEvent
}): {
  convertSSEStream: (
    upstreamStream: ReadableStream<Uint8Array>,
    from: 'openai' | 'anthropic',
    to: 'openai' | 'anthropic',
    ctx: StreamContext
  ) => ReadableStream<Uint8Array>
} {
  /**
   * SSE 流协议转换器
   *
   * 将上游 SSE 事件流从一种格式实时转换为另一种格式。
   * 例如：上游返回 OpenAI 格式的 SSE 事件 -> 转换为 Anthropic 格式 -> 推送给客户端
   *
   * @param upstreamStream - 上游供应商的 SSE 响应流
   * @param from - 上游格式
   * @param to - 客户端期望的格式
   * @param ctx - 流转换上下文（维护跨事件的状态：index、finishReason 等）
   */
  function convertSSEStream(
    upstreamStream: ReadableStream<Uint8Array>,
    from: 'openai' | 'anthropic',
    to: 'openai' | 'anthropic',
    ctx: StreamContext
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    // 行缓冲区：处理跨 chunk 的不完整行
    let buffer = ''
    // 标记流是否已结束（收到 [DONE] 或 message_stop）
    let streamDone = false

    return new ReadableStream({
      async start(controller) {
        const reader = upstreamStream.getReader()
        const decoder = new TextDecoder()
        // 当前 SSE 事件类型（event: 字段值）
        let currentEvent = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // 将新 chunk 追加到缓冲区
            buffer += decoder.decode(value, { stream: true })

            // 按换行符分割，最后一行可能不完整，保留在缓冲区
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            // 逐行解析 SSE 协议（兼容 event: 和 event: 两种格式）
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              if (line.startsWith('event:')) {
                // SSE 事件类型行（兼容有空格和无空格）
                currentEvent = line.startsWith('event: ') ? line.slice(7) : line.slice(6)
              } else if (line.startsWith('data:')) {
                // SSE 数据行（兼容有空格和无空格）
                const dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)

                // OpenAI 流结束标记：[DONE]
                if (from === 'openai' && dataStr === '[DONE]') {
                  // 将 [DONE] 转换为目标格式的结束事件
                  const results = deps.convertSSEEvent('done' as any, null as any, 'openai', 'anthropic', ctx)
                  if (results) {
                    const arr = Array.isArray(results) ? results : [results]
                    for (const r of arr) {
                      if (!r) continue
                      const evt = r.event
                      const evtStr = evt ? `event: ${evt}\n` : ''
                      const dataJson = JSON.stringify(r.data)
                      controller.enqueue(encoder.encode(`${evtStr}data: ${dataJson}\n\n`))
                    }
                  }
                  streamDone = true
                  continue
                }

                // 流已结束后跳过后续事件
                if (streamDone) continue

                // 解析 JSON 数据
                let parsedData: any
                try {
                  parsedData = JSON.parse(dataStr)
                } catch {
                  continue
                }

                // 调用 convertSSEEvent 转换单个事件
                const results = deps.convertSSEEvent(currentEvent, parsedData, from, to, ctx)
                if (!results) continue

                // 将转换结果编码为 SSE 文本推送给客户端
                const arr = Array.isArray(results) ? results : [results]
                for (const r of arr) {
                  if (!r) continue
                  const evt = r.event && r.event !== '' ? `event: ${r.event}\n` : ''
                  const dataJson = JSON.stringify(r.data)
                  controller.enqueue(encoder.encode(`${evt}data: ${dataJson}\n\n`))
                }

                // 重置事件类型（空行分隔不同事件）
                currentEvent = ''
              }
              // 空行表示事件边界，重置事件类型
              if (line === '') {
                currentEvent = ''
              }
            }
          }

          // 冲刷缓冲区中剩余的数据（流结束时可能还有未处理的行）
          if (buffer && !streamDone) {
            for (const line of buffer.split('\n')) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6)
                if (from === 'openai' && dataStr === '[DONE]') break
                let parsedData: any
                try { parsedData = JSON.parse(dataStr) } catch { continue }
                const results = deps.convertSSEEvent(currentEvent, parsedData, from, to, ctx)
                if (!results) continue
                const arr = Array.isArray(results) ? results : [results]
                for (const r of arr) {
                  if (!r) continue
                  const evt = r.event && r.event !== '' ? `event: ${r.event}\n` : ''
                  controller.enqueue(encoder.encode(`${evt}data: ${JSON.stringify(r.data)}\n\n`))
                }
              }
            }
          }

          controller.close()
        } catch (err) {
          // 转换过程中出错，记录详细状态用于调试
          logger.info('SSE_CONVERSION_ERROR', {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.slice(0, 1000) : undefined,
            streamDone,
            state: {
              lastMessagesType: ctx.state.lastMessagesType,
              index: ctx.state.index,
              done: ctx.state.done,
              finishReason: ctx.state.finishReason,
            },
          })
          controller.error(err)
        }
      }
    })
  }

  return { convertSSEStream }
}
