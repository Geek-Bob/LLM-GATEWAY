/**
 * proxy/logger.ts — 代理日志与 SSE 用量提取
 *
 * 职责：
 * 1. tryLogEntry() — 写入请求日志（NDJSON + SQLite 统计聚合）
 * 2. logAuthFailure() — 认证失败专用日志（无 apiKeyId 上下文）
 * 3. extractAndLogSSE() — 从 SSE 流中提取 token 用量并写入日志
 * 4. extractUsageFromSSE() — 从 SSE 事件文本中解析 token 用量
 * 5. extractContentFromSSE() — 从 SSE 事件文本中提取完整响应内容（调试模式）
 *
 * 数据库操作通过工厂参数注入，禁止直接导入 db/ 模块。
 */

import { createLogger } from '../core/logger'
import type { LogDebugInfo } from '../../shared/types'

/** 调试日志实例（代理日志模块内部使用） */
const logger = createLogger('proxy:logger')

/** 调试日志中 body 截断的最大字符数 */
const MAX_DEBUG_BODY_LENGTH = 4000

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
  extractContentFromSSE: (text: string, apiFormat: 'anthropic' | 'openai') => string
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
      // 调试模式下，提取完整响应内容用于日志
      if (debug) {
        const content = extractContentFromSSE(text, apiFormat)
        debug.upstream.responseBody = content || text.slice(0, MAX_DEBUG_BODY_LENGTH) // 如果提取不到内容，保留原始文本
        logger.debug('SSE_RESPONSE_EXTRACTED', { contentLength: content.length, textLength: text.length })
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
          if (data.usage) {
            tokensIn = data.usage.prompt_tokens ?? tokensIn
            tokensOut = data.usage.completion_tokens ?? tokensOut
            // 缓存命中 token：OpenAI 在 prompt_tokens_details.cached_tokens
            cacheTokens = data.usage.prompt_tokens_details?.cached_tokens ?? cacheTokens
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
   * 从 SSE 事件流文本中提取完整响应内容（调试模式专用）
   *
   * 将所有 content delta 拼接为完整文本，用于 debug 日志记录。
   * 不影响主流程，仅在 debugEnabled 时调用。
   *
   * OpenAI：从 choices[0].delta.content 提取
   * Anthropic：从 content_block_delta 事件的 delta.text 或 delta.thinking 提取
   *   - text_delta: 正常文本输出
   *   - thinking_delta: 思考过程（extended thinking）
   *
   * 注意：上游 SSE 格式可能不标准（event/data 后无空格），兼容处理
   */
  function extractContentFromSSE(
    text: string,
    apiFormat: 'anthropic' | 'openai'
  ): string {
    const parts: string[] = []

    if (apiFormat === 'openai') {
      for (const line of text.split('\n')) {
        // 兼容 "data: " 和 "data:"（无空格）
        if (!line.startsWith('data:')) continue
        const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
        if (!jsonStr || jsonStr === '[DONE]') continue
        try {
          const data = JSON.parse(jsonStr)
          const delta = data.choices?.[0]?.delta
          if (delta) {
            // 优先提取 content，其次 reasoning_content
            if (delta.content) {
              parts.push(delta.content)
            } else if (delta.reasoning_content) {
              parts.push(`[thinking] ${delta.reasoning_content}`)
            }
          }
        } catch { /* 跳过格式错误的 JSON */ }
      }
    } else {
      let eventType = ''
      for (const line of text.split('\n')) {
        // 兼容 "event: " 和 "event:"（无空格）
        if (line.startsWith('event:')) {
          eventType = line.startsWith('event: ') ? line.slice(7) : line.slice(6)
        } else if (line.startsWith('data:')) {
          const jsonStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
          try {
            const data = JSON.parse(jsonStr)
            // content_block_delta 事件包含文本增量（text_delta 或 thinking_delta）
            if (eventType === 'content_block_delta' && data.delta) {
              if (data.delta.type === 'text_delta' && data.delta.text) {
                parts.push(data.delta.text)
              } else if (data.delta.type === 'thinking_delta' && data.delta.thinking) {
                parts.push(`[thinking] ${data.delta.thinking}`)
              }
            }
          } catch { /* 跳过格式错误的 JSON */ }
        }
      }
    }

    return parts.join('')
  }

  return {
    tryLogEntry,
    logAuthFailure,
    extractAndLogSSE,
    extractUsageFromSSE,
    extractContentFromSSE,
  }
}
