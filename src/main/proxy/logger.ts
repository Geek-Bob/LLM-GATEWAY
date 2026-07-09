/**
 * proxy/logger.ts — 代理日志与 SSE 用量提取
 *
 * 职责：
 * 1. tryLogEntry() — 写入请求日志（NDJSON + SQLite 统计聚合）
 * 2. logAuthFailure() — 认证失败专用日志（无 apiKeyId 上下文）
 * 3. extractAndLogSSE() — 从 SSE 流中提取 token 用量并写入日志
 * 4. extractUsageFromSSE() — 从 SSE 事件文本中解析 token 用量
 * 5. buildSSEMergedResponse() - 将 SSE 事件流重组为非流式等价 JSON（调试模式）
 *
 * 数据库操作通过工厂参数注入，禁止直接导入 db/ 模块。
 */

import { createLogger } from '../core/logger'
import type { LogDebugInfo } from '../../shared/types'

/** 调试日志实例（代理日志模块内部使用） */
const logger = createLogger('proxy:logger')

/**
 * 请求日志条目属性
 */
export interface LogEntryProps {
  apiKeyId?: number
  providerId?: number
  model: string
  apiFormat: 'anthropic' | 'openai'
  statusCode?: number
  tokensIn?: number
  tokensOut?: number
  /** 缓存命中的输入 token 数（OpenAI: prompt_tokens_details.cached_tokens；Anthropic: usage.cache_read_input_tokens） */
  cacheTokens?: number
  durationMs?: number
  error?: string
  debug?: LogDebugInfo
}

/**
 * 代理日志服务接口
 *
 * 封装请求日志写入和认证失败日志记录，
 * 数据库操作通过工厂参数注入。
 */
export interface ProxyLogService {
  tryLogEntry: (entry: LogEntryProps) => void
  logAuthFailure: (req: { method: string; path: string; text: () => Promise<string> }, error: string) => void
  extractAndLogSSE: (
    stream: ReadableStream<Uint8Array>,
    logBase: Omit<LogEntryProps, 'model' | 'apiFormat'> & { model: string; apiFormat: 'anthropic' | 'openai' },
    apiFormat: 'anthropic' | 'openai',
    debug?: LogDebugInfo
  ) => Promise<void>
  extractUsageFromSSE: (text: string, apiFormat: 'anthropic' | 'openai') => { tokensIn: number; tokensOut: number; cacheTokens: number }
}

/**
 * 创建代理日志服务
 *
 * @param deps - 注入的数据库操作函数
 * @param deps.createLogEntry - 写入 NDJSON 日志
 * @param deps.updateRequestStats - 更新全局请求统计
 * @param deps.updateProviderStats - 更新供应商请求统计
 */
export function createProxyLogService(deps: {
  createLogEntry: (entry: LogEntryProps) => void
  updateRequestStats: (entry: { tokensIn?: number; tokensOut?: number; cacheTokens?: number; durationMs?: number; statusCode?: number }) => Promise<void>
  updateProviderStats: (entry: { providerId?: number; model: string; tokensIn?: number; tokensOut?: number; cacheTokens?: number; durationMs?: number; statusCode?: number }) => Promise<void>
}): ProxyLogService {
  /**
   * 写入请求日志（三步原子操作）
   *
   * 1. createLogEntry — 写入 NDJSON 文件（详细记录，含 debug 信息）
   * 2. updateRequestStats — 更新 SQLite 全局统计表（按日期+小时聚合）
   * 3. updateProviderStats — 更新 SQLite 供应商统计表（按日期+小时+供应商+模型聚合）
   *
   * 任何一步失败都静默忽略，不影响主请求流程（日志是尽力而为）。
   */
  function tryLogEntry(entry: LogEntryProps): void {
    try {
      deps.createLogEntry(entry)
      // fire-and-forget：统计更新是异步的，不影响主流程
      deps.updateRequestStats(entry).catch((err) =>
        logger.debug('updateRequestStats failed (non-fatal)', { error: err instanceof Error ? err.message : String(err) })
      )
      deps.updateProviderStats(entry).catch((err) =>
        logger.debug('updateProviderStats failed (non-fatal)', { error: err instanceof Error ? err.message : String(err) })
      )
    } catch (err) {
      logger.debug('tryLogEntry failed (non-fatal)', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * 记录认证失败日志
   *
   * 认证失败时无法获取完整的请求上下文（apiKeyId 等），
   * 所以单独处理：尝试从请求体中提取 model 信息用于日志。
   * 不更新统计表（认证失败不算有效请求）。
   */
  function logAuthFailure(
    req: { method: string; path: string; text: () => Promise<string> },
    error: string
  ): void {
    logger.info('AUTH FAIL', { method: req.method, path: req.path, error })
    // 异步读取请求体提取 model 信息（请求体只能读取一次，所以用 .then）
    req.text().then(text => {
      try {
        const body = JSON.parse(text)
        tryLogEntry({
          model: body.model || 'unknown',
          apiFormat: req.path.includes('/v1/chat/completions') ? 'openai' : 'anthropic',
          statusCode: 401,
          error
        })
        logger.debug('AUTH FAIL body', { model: body.model })
      } catch {
        logger.debug('AUTH FAIL body unparseable', { textLen: text?.length })
      }
    }).catch((e) => logger.debug('Request body read failed', { error: e instanceof Error ? e.message : String(e) }))
  }

  /**
   * 从 SSE 流中提取 token 用量并写入日志
   *
   * 工作原理：
   *   1. 读取整个 SSE 流的文本内容
   *   2. 解析每个 SSE 事件，提取 token 用量信息
   *   3. 调用 tryLogEntry 写入 NDJSON + SQLite 统计
   *
   * 注意：此函数在 tee() 分支出的流上运行，不影响客户端接收的流
   */
  async function extractAndLogSSE(
    stream: ReadableStream<Uint8Array>,
    logBase: Omit<LogEntryProps, 'model' | 'apiFormat'> & { model: string; apiFormat: 'anthropic' | 'openai' },
    apiFormat: 'anthropic' | 'openai',
    debug?: LogDebugInfo
  ): Promise<void> {
    try {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let text = ''
      // 逐块读取整个流
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
      }
      // 从 SSE 事件流中提取 token 用量
      const usage = extractUsageFromSSE(text, apiFormat)
      // 调试模式下，将 SSE 流重组为非流式等价 JSON（与非流式响应形态统一）
      if (debug) {
        debug.upstream.responseBody = buildSSEMergedResponse(text, apiFormat)
        logger.debug('SSE_RESPONSE_EXTRACTED', { textLength: text.length })
      }
      tryLogEntry({ ...logBase, ...usage, debug })
    } catch (err) {
      // 日志记录是尽力而为，失败静默忽略
      logger.debug('SSE_EXTRACT_ERROR (non-fatal)', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * 从 SSE 事件流文本中提取 token 用量
   *
   * OpenAI 格式：usage 字段在每个 chunk 的顶层
   *   { "usage": { "prompt_tokens": 100, "completion_tokens": 50, "prompt_tokens_details": { "cached_tokens": 30 } } }
   *
   * Anthropic 格式：usage 分布在两个事件中
   *   message_start -> { "message": { "usage": { "input_tokens": 100, "output_tokens": 0, "cache_read_input_tokens": 40 } } }
   *   message_delta -> { "usage": { "output_tokens": 50 } }
   *
   * 缓存口径二分法：
   *   - OpenAI：usage.prompt_tokens_details.cached_tokens（命中的输入 token）
   *   - Anthropic：message_start 的 usage.cache_read_input_tokens（缓存命中）；
   *     cache_creation_input_tokens（写缓存）不计入 cacheTokens
   *   - 无缓存字段 → cacheTokens=0
   */
  function extractUsageFromSSE(
    text: string,
    apiFormat: 'anthropic' | 'openai'
  ): { tokensIn: number; tokensOut: number; cacheTokens: number } {
    let tokensIn = 0
    let tokensOut = 0
    let cacheTokens = 0

    if (apiFormat === 'openai') {
      // OpenAI：遍历所有 data: 行，提取 usage 字段（兼容有空格和无空格）
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue
        const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
        if (!jsonStr || jsonStr === '[DONE]') continue
        try {
          const data = JSON.parse(jsonStr)
          // usage 位置兼容：
          //   标准 OpenAI（stream_options.include_usage）→ 顶层 data.usage
          //   kimi/moonshot 等非标准上游 → data.choices[0].usage
          const usage = data.usage ?? data.choices?.[0]?.usage
          if (usage) {
            tokensIn = usage.prompt_tokens ?? tokensIn
            tokensOut = usage.completion_tokens ?? tokensOut
            // 缓存命中 token：OpenAI 在 prompt_tokens_details.cached_tokens
            cacheTokens = usage.prompt_tokens_details?.cached_tokens ?? cacheTokens
          }
        } catch { /* 跳过格式错误的 JSON */ }
      }
    } else {
      // Anthropic：需要跟踪 event 类型，从不同事件中提取 usage（兼容有空格和无空格）
      let eventType = ''
      for (const line of text.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.startsWith('event: ') ? line.slice(7) : line.slice(6)
        } else if (line.startsWith('data:')) {
          const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
          try {
            const data = JSON.parse(jsonStr)
            // message_start 事件：包含 input_tokens 和初始 output_tokens
            if (eventType === 'message_start' && data.message?.usage) {
              tokensIn = data.message.usage.input_tokens ?? tokensIn
              tokensOut = data.message.usage.output_tokens ?? tokensOut
              // 缓存命中 token：Anthropic 在 cache_read_input_tokens；
              // cache_creation_input_tokens（写缓存）不计入
              cacheTokens = data.message.usage.cache_read_input_tokens ?? cacheTokens
            }
            // message_delta 事件：包含最终 output_tokens
            if (eventType === 'message_delta' && data.usage) {
              tokensOut = data.usage.output_tokens ?? tokensOut
            }
          } catch { /* 跳过格式错误的 JSON */ }
        }
      }
    }

    return { tokensIn, tokensOut, cacheTokens }
  }

  /**
   * 将上游 SSE 事件流文本重组为非流式等价 JSON 对象，与非流式响应形态统一。
   *
   * 解析每个 `data:` 行为对象（Anthropic 的 `event:` 类型用于事件识别），
   * 按协议合并为单个响应对象：OpenAI -> chat.completion，Anthropic -> message。
   * 格式错误的 JSON 行与 `[DONE]` 标记跳过。
   *
   * 注意：上游 SSE 格式可能不标准（event/data 后无空格），兼容处理
   *
   * @param text - 上游 SSE 原始文本（多行 event:/data: 序列）
   * @param apiFormat - 上游协议格式
   * @returns JSON 字符串，形态等价于该请求非流式时的上游响应
   */
  function buildSSEMergedResponse(text: string, apiFormat: 'anthropic' | 'openai'): string {
    const chunks = parseSSEChunks(text)
    const merged = apiFormat === 'openai' ? mergeOpenAIChunks(chunks) : mergeAnthropicChunks(chunks)
    return JSON.stringify(merged)
  }

  /** 解析 SSE 文本为 chunk 对象数组，Anthropic 的 event: 类型注入 `_event` 字段。 */
  function parseSSEChunks(text: string): Record<string, unknown>[] {
    const chunks: Record<string, unknown>[] = []
    let eventType = ''
    for (const line of text.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.startsWith('event: ') ? line.slice(7) : line.slice(6)
      } else if (line.startsWith('data:')) {
        const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
        if (!jsonStr || jsonStr === '[DONE]') continue
        try {
          const obj = JSON.parse(jsonStr) as Record<string, unknown>
          if (eventType) obj._event = eventType
          chunks.push(obj)
        } catch { /* 跳过格式错误的 JSON 行 */ }
      }
    }
    return chunks
  }

  /**
   * 将 OpenAI 流式 chunk 数组合并为非流式 chat.completion 对象。
   *
   * 取首个 chunk 的 id/model/created，拼接所有 delta.content 为 message.content，
   * 取首个 delta.role（默认 assistant），取末个非空 finish_reason，取末个 usage。
   */
  function mergeOpenAIChunks(chunks: Record<string, unknown>[]): Record<string, unknown> {
    let content = ''
    let id = '', model = '', role = 'assistant'
    let created = 0
    let finishReason: string | null = null
    let usage: Record<string, unknown> | undefined

    for (const chunk of chunks) {
      if (typeof chunk.id === 'string' && !id) id = chunk.id
      if (typeof chunk.model === 'string' && !model) model = chunk.model
      if (typeof chunk.created === 'number' && !created) created = chunk.created
      const choices = chunk.choices as Array<Record<string, unknown>> | undefined
      const choice0 = choices?.[0]
      const delta = choice0?.delta as Record<string, unknown> | undefined
      if (typeof delta?.role === 'string') role = delta.role
      if (typeof delta?.content === 'string') content += delta.content
      const fr = choice0?.finish_reason
      if (typeof fr === 'string' && fr) finishReason = fr
      if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage as Record<string, unknown>
    }

    const result: Record<string, unknown> = {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message: { role, content },
        finish_reason: finishReason,
      }],
    }
    if (usage) result.usage = usage
    return result
  }

  /**
   * 将 Anthropic 流式事件数组合并为非流式 message 对象。
   *
   * 从 message_start 取 id/model/role/input usage（含 cache 字段），拼接
   * content_block_delta 的 text/thinking 为 content blocks（thinking 在前 text 在后），
   * 从 message_delta 取 stop_reason 和 output_tokens。
   */
  function mergeAnthropicChunks(chunks: Record<string, unknown>[]): Record<string, unknown> {
    let id = '', model = '', role = 'assistant'
    let stopReason: string | null = null
    let inputUsage: Record<string, unknown> = {}
    let outputTokens = 0
    const textParts: string[] = []
    const thinkingParts: string[] = []

    for (const chunk of chunks) {
      const event = chunk._event as string | undefined
      if (event === 'message_start') {
        const msg = chunk.message as Record<string, unknown> | undefined
        if (typeof msg?.id === 'string') id = msg.id
        if (typeof msg?.model === 'string') model = msg.model
        if (typeof msg?.role === 'string') role = msg.role
        if (msg?.usage && typeof msg.usage === 'object') inputUsage = msg.usage as Record<string, unknown>
      } else if (event === 'content_block_delta') {
        const delta = chunk.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          textParts.push(delta.text)
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          thinkingParts.push(delta.thinking)
        }
      } else if (event === 'message_delta') {
        const delta = chunk.delta as Record<string, unknown> | undefined
        if (typeof delta?.stop_reason === 'string' && delta.stop_reason) stopReason = delta.stop_reason
        const u = chunk.usage as Record<string, unknown> | undefined
        if (typeof u?.output_tokens === 'number') outputTokens = u.output_tokens
      }
    }

    const content: Record<string, unknown>[] = []
    if (thinkingParts.length) content.push({ type: 'thinking', thinking: thinkingParts.join('') })
    if (textParts.length) content.push({ type: 'text', text: textParts.join('') })

    const usage: Record<string, unknown> = {
      input_tokens: inputUsage.input_tokens ?? 0,
      output_tokens: outputTokens,
    }
    if (typeof inputUsage.cache_read_input_tokens === 'number') {
      usage.cache_read_input_tokens = inputUsage.cache_read_input_tokens
    }
    if (typeof inputUsage.cache_creation_input_tokens === 'number') {
      usage.cache_creation_input_tokens = inputUsage.cache_creation_input_tokens
    }

    return {
      id,
      type: 'message',
      role,
      model,
      content,
      stop_reason: stopReason,
      usage,
    }
  }

  return {
    tryLogEntry,
    logAuthFailure,
    extractAndLogSSE,
    extractUsageFromSSE,
  }
}
