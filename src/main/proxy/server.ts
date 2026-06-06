/**
 * proxy/server.ts — HTTP 代理服务器
 *
 * 职责：
 * 1. 接收客户端 OpenAI/Anthropic 格式的 Chat 请求
 * 2. 认证（API Key 验证）+ 限流（滑动窗口）
 * 3. 路由到对应上游供应商（自动协议转换）
 * 4. 转发请求并处理响应（流式 SSE / 非流式 JSON）
 * 5. 记录请求日志（NDJSON 文件 + SQLite 统计聚合）
 *
 * 请求生命周期：
 *   Client → auth → rateLimit → resolveProvider → [convertRequest] → fetch upstream
 *         → [convertResponse/convertSSEStream] → Client
 *         → tryLogEntry（异步写入日志 + 统计）
 */
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware'
import { RateLimiter } from './rate-limiter'
import { resolveProvider } from './router'
import { buildProxyUrl, buildProxyHeaders } from './forwarder'
import { convertRequest, convertResponse, convertSSEEvent, createStreamContext, type StreamContext } from './converter'
import { verifyApiKey } from '../db/api-keys'
import * as path from 'path'
import { createLogger } from '../core/logger'

import { createLogEntry, updateRequestStats, updateProviderStats } from '../db/logs'
import { getDebugMode } from './manager'
import { createModelsService } from '../domains/models/models.service'
import type { LogDebugInfo } from '../../shared/types'

/**
 * 清理上游响应头，移除传输编码相关的头
 *
 * Node.js fetch 自动解压 Brotli/gzip 响应，response.body 已是解压后的数据。
 * 若原样转发 content-encoding / content-length / transfer-encoding，
 * 客户端会尝试再次解压已解压的数据，导致流损坏并抛出 "network error"。
 */
function sanitizeResponseHeaders(headers: Headers): Record<string, string> {
  const cleaned: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') return
    cleaned[key] = value
  })
  return cleaned
}

/** 工作目录（用于调试日志文件输出） */
const LOG_DIR = process.cwd()
/** 认证相关调试日志（API Key 验证、认证失败等，启动时清空） */
const authLog = createLogger('proxy:auth', { file: path.join(LOG_DIR, 'llm-gateway-auth-debug.log'), truncate: true })
/** 代理请求全链路调试日志（路由、转换、上游请求/响应等，启动时清空） */
const proxyLog = createLogger('proxy:debug', { file: path.join(LOG_DIR, 'llm-gateway-proxy-debug.log'), truncate: true })

/**
 * Hono 路由环境类型
 * Variables.apiKey: 认证中间件注入的已验证 API Key 信息
 */
interface AppEnv {
  Variables: {
    apiKey: { id: number; name: string; rate_limit: number }
  }
}

/**
 * 创建代理 HTTP 服务器
 *
 * 路由结构：
 *   POST /v1/chat/completions  → OpenAI 格式 Chat 请求
 *   POST /v1/messages          → Anthropic 格式 Chat 请求
 *   GET  /v1/models            → 列出所有可用模型
 *   GET  /health               → 健康检查
 *
 * 中间件链（/v1/*）：
 *   1. CORS — 允许跨域
 *   2. 认证 — 提取 Bearer token → verifyApiKey → 注入 c.var.apiKey
 *   3. 限流 — 滑动窗口，按 API Key 维度计数
 */
export function createServer() {
  const app = new Hono<AppEnv>()
  const rateLimiter = new RateLimiter()
  /** 模型映射 service 实例，供 handleProxyRequest 中查找映射使用 */
  const modelsService = createModelsService()

  // CORS 全局中间件：允许所有跨域请求
  app.use('*', cors())

  // 认证中间件（/v1/*）：提取 Bearer token → verifyApiKey → 设置 c.var.apiKey
  app.use('/v1/*', async (c, next) => {
    const authHeader = c.req.header('authorization')
    // 记录请求头用于调试（authorization 截断保护，避免泄露完整密钥）
    const allHeaders: Record<string, string> = {}
    c.req.raw.headers.forEach((v, k) => { allHeaders[k] = k === 'authorization' ? v.slice(0, 20) + '...' : v })
    authLog.info('REQUEST', { path: c.req.path, method: c.req.method, allHeaders })
    // 支持两种认证方式：Authorization: Bearer xxx 或 X-Api-Key: xxx
    const token = authMiddleware(authHeader) || c.req.header('x-api-key') || null
    if (!token) {
      logAuthFailure(c, `missing authorization header`)
      return c.json({ error: 'unauthorized' }, 401)
    }
    // 从数据库验证 API Key 有效性
    const apiKey = verifyApiKey(token)
    if (!apiKey) {
      authLog.warn('AUTH FAIL: invalid key', { tokenPrefix: token.slice(0, 10) + '...' })
      logAuthFailure(c, `invalid api key`)
      return c.json({ error: 'unauthorized' }, 401)
    }
    authLog.info('AUTH OK', { keyId: apiKey.id, keyName: apiKey.name })
    // 将已验证的 API Key 信息注入请求上下文，供后续中间件和路由使用
    c.set('apiKey', apiKey)
    await next()
  })

  // 限流中间件（/v1/*）：滑动窗口限流，按 API Key 维度计数
  // 每个 API Key 有独立的 rate_limit 配置，超限返回 429 + Retry-After 头
  app.use('/v1/*', async (c, next) => {
    const key = c.var.apiKey
    const result = rateLimiter.check(`apikey:${key.id}`, key.rate_limit)
    if (!result.allowed) {
      c.header(
        'Retry-After',
        String(Math.ceil((result.resetAt - Date.now()) / 1000))
      )
      return c.json({ error: 'rate_limit_exceeded' }, 429)
    }
    await next()
  })

  // POST /v1/chat/completions — OpenAI 格式 Chat 请求
  app.post('/v1/chat/completions', async (c) => {
    return handleProxyRequest(c, '/v1/chat/completions', 'openai')
  })

  // POST /v1/messages — Anthropic 格式 Chat 请求
  app.post('/v1/messages', async (c) => {
    return handleProxyRequest(c, '/v1/messages', 'anthropic')
  })

  // GET /v1/models — 列出所有已配置供应商的可用模型（委托给 modelsService）
  app.get('/v1/models', (c) => {
    const models = modelsService.getAllModels()
    return c.json({
      data: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        object: 'model'
      }))
    })
  })

  // GET /health — 健康检查端点
  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app

  /**
   * 核心代理处理函数
   *
   * 完整请求生命周期：
   *   1. 解析客户端请求体，提取 model
   *   2. resolveProvider(model) → 路由到对应上游供应商
   *   3. 协议转换（如客户端用 OpenAI 格式但供应商是 Anthropic）
   *   4. 构建上游请求 URL + Headers，fetch 上游
   *   5. 处理响应：错误透传 / 流式 SSE / 非流式 JSON
   *   6. 提取 token 用量，写入日志（NDJSON + SQLite 统计）
   *
   * @param c - Hono 请求上下文（含已认证的 apiKey）
   * @param path - 请求路径（/v1/chat/completions 或 /v1/messages）
   * @param apiFormat - 客户端使用的 API 格式
   */
  async function handleProxyRequest(
    c: Context<AppEnv>,
    path: string,
    apiFormat: 'anthropic' | 'openai'
  ): Promise<Response> {
    const startTime = Date.now()
    // 调试模式：记录完整请求/响应链路信息，用于排查问题
    const debugEnabled = getDebugMode()
    const debugInfo: LogDebugInfo | null = debugEnabled ? {
      client: { body: '', apiFormat },
      route: { providerName: '', providerType: '', baseUrl: '', modelName: '' },
      upstream: { url: '', body: '', statusCode: 0, responseBody: '' }
    } : null
    try {
      const body = await c.req.json()
      const model = body.model

      // 记录客户端请求（截断 body 避免日志过大）
      proxyLog.info('CLIENT_REQUEST', {
        apiFormat,
        path,
        clientModel: model,
        clientBody: JSON.stringify(body).slice(0, 4000),
        clientHeaders: (() => {
          const h: Record<string, string> = {}
          c.req.raw.headers.forEach((v, k) => { h[k] = k === 'authorization' ? v.slice(0, 12) + '...' : v })
          return h
        })(),
      })

      if (!model) {
        return c.json({ error: 'model is required' }, 400)
      }

      // 记录客户端原始请求信息（调试模式）
      if (debugInfo) {
        debugInfo.client.body = JSON.stringify(body)
        debugInfo.client.apiFormat = apiFormat
      }

      // 模型映射：根据 sourceModel 查找活跃映射，有则替换为 targetModel，无则透传原始模型名
      const mapping = modelsService.findModelMapping(model)
      const resolvedModel = mapping ? mapping.targetModel : model

      // 记录映射结果（调试模式）
      if (debugInfo && mapping) {
        proxyLog.info('MODEL_MAPPING', { sourceModel: model, targetModel: mapping.targetModel })
      }

      // 路由解析：根据 resolvedModel 名称匹配供应商 + 解析出上游实际模型名
      const route = resolveProvider(resolvedModel)
      const decryptedKey = route.provider.apiKey

      // 记录路由解析结果
      proxyLog.info('ROUTE_RESOLVED', {
        providerName: route.provider.name,
        providerType: route.provider.providerType,
        providerBaseUrl: route.provider.baseUrl,
        modelName: route.modelName,
        needsConversion: apiFormat !== route.provider.providerType,
      })

      // 记录路由信息（调试模式）
      if (debugInfo) {
        debugInfo.route = {
          providerName: route.provider.name,
          providerType: route.provider.providerType,
          baseUrl: route.provider.baseUrl,
          modelName: route.modelName
        }
      }

      // --- 协议自动转换 ---
      // 判断是否需要转换：客户端格式 ≠ 供应商格式时触发
      // 例如：客户端发 OpenAI 格式 → 供应商只支持 Anthropic 格式
      const needsConversion = apiFormat !== route.provider.providerType
      let proxyPath = path
      // 用上游实际模型名替换客户端传入的模型别名
      let proxyBody: any = { ...body, model: route.modelName }

      if (needsConversion) {
        try {
          // convertRequest: 转换请求体格式 + 路径（/v1/chat/completions ↔ /v1/messages）
          const converted = convertRequest(proxyBody, apiFormat, route.provider.providerType as 'openai' | 'anthropic')
          proxyLog.info('CONVERSION', {
            from: apiFormat,
            to: route.provider.providerType,
            originalPath: proxyPath,
            convertedPath: converted.path,
            originalModel: proxyBody.model,
            convertedModel: converted.body.model,
            convertedBody: JSON.stringify(converted.body).slice(0, 4000),
          })
          proxyBody = converted.body
          proxyPath = converted.path

          // 记录协议转换信息（调试模式）
          if (debugInfo) {
            debugInfo.conversion = {
              from: apiFormat,
              to: route.provider.providerType as string,
              originalPath: path,
              convertedPath: proxyPath,
              originalModel: body.model,
              convertedModel: proxyBody.model
            }
          }
        } catch (convErr: any) {
          proxyLog.info('CONVERSION_ERROR', { error: convErr.message })
          return c.json({ error: `protocol_conversion_failed: ${convErr.message}` }, 502)
        }
      }
      // --- 协议自动转换结束 ---

      // 构建上游请求完整 URL（供应商 baseUrl + 路径）
      const url = buildProxyUrl(route.provider, proxyPath)

      // 记录上游请求信息（调试模式）
      if (debugInfo) {
        debugInfo.upstream.url = url
        debugInfo.upstream.body = JSON.stringify(proxyBody)
      }

      // 透传客户端请求头（仅 content-type 和 anthropic-beta）
      const originalHeaders: Record<string, string> = {}
      const contentType = c.req.header('content-type')
      if (contentType) {
        originalHeaders['content-type'] = contentType
      }
      // 透传 anthropic-beta 头（仅当供应商是 Anthropic 时）
      const anthropicBeta = c.req.header('anthropic-beta')
      if (anthropicBeta && route.provider.providerType === 'anthropic') {
        originalHeaders['anthropic-beta'] = anthropicBeta
      }

      // 构建上游请求头（含认证信息：Authorization: Bearer xxx 或 x-api-key: xxx）
      const proxyHeaders = buildProxyHeaders(
        route.provider,
        decryptedKey,
        originalHeaders
      )

      // 记录上游请求详情
      proxyLog.info('UPSTREAM_REQUEST', {
        url,
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify(proxyBody).slice(0, 4000),
        stream: !!proxyBody.stream,
      })

      // 发送上游请求
      const response = await fetch(url, {
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify(proxyBody)
      })

      // 记录上游响应状态
      proxyLog.info('UPSTREAM_RESPONSE', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      })

      // 构建日志基础信息（所有日志场景共用）
      const logBase = {
        apiKeyId: c.var.apiKey.id,
        providerId: route.provider.id,
        model,
        apiFormat,
        statusCode: response.status,
        durationMs: Date.now() - startTime
      }

      // --- 错误响应处理 ---
      // 上游返回非 200 时，读取错误体并透传给客户端
      // 流式请求也在此处处理错误（错误不走 SSE 流，直接返回 JSON）
      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch {
          errorText = `(failed to read error body: ${response.status})`
        }

        proxyLog.info('UPSTREAM_ERROR_BODY', { status: response.status, body: errorText.slice(0, 4000) })

        // 尝试解析 JSON，失败则构造标准错误格式
        let errorBody: any
        let isJson = false
        try {
          errorBody = JSON.parse(errorText)
          isJson = true
        } catch {
          errorBody = { error: { message: errorText.slice(0, 500) } }
        }

        // 场景1：无需转换 + 非 JSON → 直接透传原始文本
        if (!needsConversion && !isJson) {
          if (debugInfo) {
            debugInfo.upstream.statusCode = response.status
            debugInfo.upstream.responseBody = errorText
          }
          tryLogEntry(c, {
            ...logBase,
            error: `Upstream ${response.status}: ${errorText.slice(0, 200)}`,
            debug: debugInfo ?? undefined
          })
          return c.body(errorText, response.status as any)
        }

        // 场景2：需要转换时，将上游错误格式转为客户端期望的格式
        const convertedError = needsConversion
          ? convertResponse(errorBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
          : errorBody

        if (debugInfo) {
          debugInfo.upstream.statusCode = response.status
          debugInfo.upstream.responseBody = errorText
        }

        // 提取错误消息用于日志
        const errMsg = errorBody?.error?.message || errorBody?.error || errorText.slice(0, 200)

        // 错误统一返回 JSON（即使是流式请求），确保客户端能正确解析错误信息
        tryLogEntry(c, { ...logBase, error: typeof errMsg === 'string' ? errMsg : String(errMsg).slice(0, 200), debug: debugInfo ?? undefined })
        return c.json(convertedError, response.status as any)
      }

      // --- 流式响应处理（SSE） ---
      if (proxyBody.stream && response.body) {
        // tee() 将一份流拆成两份：一份给客户端，一份用于提取 token 用量写日志
        const [forClient, forLogging] = response.body.tee()

        if (needsConversion) {
          // 需要协议转换：逐事件转换 SSE 格式（如 OpenAI → Anthropic）
          const ctx = createStreamContext()
          const convertedStream = convertSSEStream(
            forClient,
            route.provider.providerType as 'openai' | 'anthropic',
            apiFormat,
            ctx
          )
          if (debugInfo) {
            debugInfo.upstream.statusCode = response.status
          }
          // 异步提取 token 用量并写日志（不阻塞客户端响应）
          extractAndLogSSE(forLogging, logBase, route.provider.providerType as 'anthropic' | 'openai', debugInfo ?? undefined).catch(() => {})
          return new Response(convertedStream, {
            status: response.status,
            headers: sanitizeResponseHeaders(response.headers)
          })
        }

        // 无需转换：直接透传上游 SSE 流
        if (debugInfo) {
          debugInfo.upstream.statusCode = response.status
        }
        // 异步提取 token 用量并写日志
        extractAndLogSSE(forLogging, logBase, apiFormat, debugInfo ?? undefined).catch(() => {})
        return new Response(forClient, {
          status: response.status,
          headers: sanitizeResponseHeaders(response.headers)
        })
      }

      // --- 非流式响应处理 ---
      // 解析上游 JSON 响应体
      const responseBody = await response.json()
      proxyLog.info('UPSTREAM_SUCCESS_BODY', { body: JSON.stringify(responseBody).slice(0, 4000) })
      // 需要转换时，将上游响应格式转为客户端期望的格式
      const convertedBody = needsConversion
        ? convertResponse(responseBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
        : responseBody

      if (debugInfo) {
        debugInfo.upstream.statusCode = response.status
        debugInfo.upstream.responseBody = JSON.stringify(responseBody)
      }

      // 从响应体提取 token 用量（OpenAI 和 Anthropic 字段名不同）
      let tokensIn = 0
      let tokensOut = 0
      if (apiFormat === 'openai' && convertedBody.usage) {
        tokensIn = convertedBody.usage.prompt_tokens ?? 0
        tokensOut = convertedBody.usage.completion_tokens ?? 0
      } else if (apiFormat === 'anthropic' && convertedBody.usage) {
        tokensIn = convertedBody.usage.input_tokens ?? 0
        tokensOut = convertedBody.usage.output_tokens ?? 0
      }
      // 写入日志（NDJSON + SQLite 统计）
      tryLogEntry(c, { ...logBase, tokensIn, tokensOut, debug: debugInfo ?? undefined })
      return c.json(convertedBody, response.status as any)
    } catch (err) {
      // 捕获所有未处理异常（网络错误、JSON 解析失败等）
      return handleProxyError(c, err, startTime, apiFormat, debugInfo)
    }
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
    logBase: { apiKeyId: number; providerId?: number; model: string; apiFormat: 'anthropic' | 'openai'; statusCode: number; durationMs: number },
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
        debug.upstream.responseBody = content || text.slice(0, 4000) // 如果提取不到内容，保留原始文本
        proxyLog.info('SSE_RESPONSE_EXTRACTED', { contentLength: content.length, textLength: text.length })
      }
      tryLogEntry(null as any, { ...logBase, ...usage, debug })
    } catch (err) {
      // 日志记录是尽力而为，失败静默忽略
      proxyLog.error('SSE_EXTRACT_ERROR', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * SSE 流协议转换器
   *
   * 将上游 SSE 事件流从一种格式实时转换为另一种格式。
   * 例如：上游返回 OpenAI 格式的 SSE 事件 → 转换为 Anthropic 格式 → 推送给客户端
   *
   * 转换过程：
   *   1. 逐块读取上游流，缓冲不完整的行
   *   2. 按行解析 SSE 协议（event: / data: 字段）
   *   3. 调用 convertSSEEvent 逐事件转换格式
   *   4. 将转换后的事件编码为 SSE 文本推送给客户端
   *   5. 处理流结束（OpenAI [DONE] 标记 / Anthropic message_stop 事件）
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
                  const results = convertSSEEvent('done' as any, null as any, 'openai', 'anthropic', ctx)
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
                const results = convertSSEEvent(currentEvent, parsedData, from, to, ctx)
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
                const results = convertSSEEvent(currentEvent, parsedData, from, to, ctx)
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
          proxyLog.info('SSE_CONVERSION_ERROR', {
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

  /**
   * 代理请求异常处理
   *
   * 捕获路由失败、模型禁用、网络错误等未处理异常，
   * 根据错误消息映射为合适的 HTTP 状态码，并记录日志。
   *
   * 状态码映射：
   *   404 — 未知供应商/模型（Unknown provider / Invalid model / not found）
   *   503 — 供应商已禁用（is disabled / not active）
   *   400 — 模型 ID 格式错误（Invalid model ID format）
   *   502 — 其他代理错误（默认）
   */
  function handleProxyError(
    c: Context<AppEnv>,
    err: unknown,
    startTime: number,
    apiFormat: 'anthropic' | 'openai',
    debugInfo?: LogDebugInfo | null
  ): Response {
    const message = err instanceof Error ? err.message : String(err)
    proxyLog.info('PROXY_ERROR', { error: message, stack: err instanceof Error ? err.stack?.slice(0, 1000) : undefined })
    let status: number = 502

    // 根据错误消息关键词映射 HTTP 状态码
    if (
      message.includes('Unknown provider') ||
      message.includes('Invalid model') ||
      message.includes('Provider not found') ||
      message.includes('not found')
    ) {
      status = 404
    } else if (
      message.includes('is disabled') ||
      message.includes('not active')
    ) {
      status = 503
    } else if (message.includes('Invalid model ID format')) {
      status = 400
    }

    // 将错误信息写入 debugInfo（调试模式）
    if (debugInfo) {
      debugInfo.error = message
    }

    // 记录错误日志（model 为 unknown，因为路由可能已失败）
    tryLogEntry(c, {
      model: 'unknown',
      apiFormat,
      statusCode: status,
      durationMs: Date.now() - startTime,
      error: message,
      debug: debugInfo ?? undefined
    })

    return c.json({ error: message }, status as any)
  }

  /**
   * 写入请求日志（三步原子操作）
   *
   * 1. createLogEntry — 写入 NDJSON 文件（详细记录，含 debug 信息）
   * 2. updateRequestStats — 更新 SQLite 全局统计表（按日期+小时聚合）
   * 3. updateProviderStats — 更新 SQLite 供应商统计表（按日期+小时+供应商+模型聚合）
   *
   * 任何一步失败都静默忽略，不影响主请求流程（日志是尽力而为）
   */
  function tryLogEntry(
    _c: Context<AppEnv>,
    entry: {
      apiKeyId?: number
      providerId?: number
      model: string
      apiFormat: 'anthropic' | 'openai'
      statusCode?: number
      tokensIn?: number
      tokensOut?: number
      durationMs?: number
      error?: string
      debug?: LogDebugInfo
    }
  ): void {
    try {
      createLogEntry(entry)
      updateRequestStats(entry)
      updateProviderStats(entry)
    } catch {
      // 日志写入失败静默忽略，不影响主请求流程
    }
  }

  /**
   * 记录认证失败日志
   *
   * 认证失败时无法获取完整的请求上下文（apiKeyId 等），
   * 所以单独处理：尝试从请求体中提取 model 信息用于日志。
   * 不更新统计表（认证失败不算有效请求）。
   */
  function logAuthFailure(c: Context, error: string): void {
    console.log(`[AUTH FAIL] ${c.req.method} ${c.req.path} - ${error}`)
    // 异步读取请求体提取 model 信息（请求体只能读取一次，所以用 .then）
    c.req.text().then(text => {
      try {
        const body = JSON.parse(text)
        authLog.info('AUTH FAIL body', { model: body.model })
        createLogEntry({
          model: body.model || 'unknown',
          apiFormat: c.req.path.includes('/v1/chat/completions') ? 'openai' : 'anthropic',
          statusCode: 401,
          error
        })
      } catch { authLog.info('AUTH FAIL body unparseable', { textLen: text?.length }) }
    }).catch(() => {})
  }

  /**
   * 从 SSE 事件流文本中提取 token 用量
   *
   * OpenAI 格式：usage 字段在每个 chunk 的顶层
   *   { "usage": { "prompt_tokens": 100, "completion_tokens": 50 } }
   *
   * Anthropic 格式：usage 分布在两个事件中
   *   message_start → { "message": { "usage": { "input_tokens": 100, "output_tokens": 0 } } }
   *   message_delta → { "usage": { "output_tokens": 50 } }
   */
  function extractUsageFromSSE(
    text: string,
    apiFormat: 'anthropic' | 'openai'
  ): { tokensIn: number; tokensOut: number } {
    let tokensIn = 0
    let tokensOut = 0

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
            }
            // message_delta 事件：包含最终 output_tokens
            if (eventType === 'message_delta' && data.usage) {
              tokensOut = data.usage.output_tokens ?? tokensOut
            }
          } catch { /* 跳过格式错误的 JSON */ }
        }
      }
    }

    return { tokensIn, tokensOut }
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
}
