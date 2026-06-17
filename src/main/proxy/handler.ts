/**
 * proxy/handler.ts — 核心代理请求处理
 *
 * 职责：
 * 1. handleProxyRequest() — 完整的代理请求生命周期：
 *    解析请求体 -> 模型映射 -> 路由解析 -> 协议转换 -> 构建上游请求 -> fetch
 *    -> 响应处理（错误/流式/非流式）-> 日志记录
 * 2. handleProxyError() — 代理请求异常处理，映射错误到 HTTP 状态码
 *
 * 依赖通过工厂参数注入，禁止直接导入 db/ 模块。
 */

import type { Context } from 'hono'
import { buildProxyUrl, buildProxyHeaders } from './forwarder'
import { convertRequest, convertResponse, createStreamContext } from './converter'
import { resolveProvider } from './router'
import { createLogger, type Logger } from '../core/logger'
import { getDebugLogPath } from '../core/debug-log'
import type { ProxyLogService } from './logger'
import type { LogDebugInfo, Provider } from '../../shared/types'

// 请求链路调试日志：dev=项目根 proxy-debug.log，正式包=安装目录 logs/
// truncate:true 每次启动清空（"调试日志每次启动清空"规则）；正式业务日志走 NDJSON
// 懒加载：getDebugLogPath 需访问 electron app，必须延迟到运行时（app ready 后）求值，
// 避免模块 import 阶段在非 electron 进程（vitest node 环境）抛错
let _logger: Logger | null = null
function logger(): Logger {
  if (!_logger) {
    _logger = createLogger('proxy:handler', {
      file: getDebugLogPath('proxy-debug.log'),
      truncate: true,
    })
  }
  return _logger
}

/** 日志中 body 截断的最大字符数，避免大请求体撑爆日志 */
const MAX_LOG_BODY_LENGTH = 4000

/**
 * 代理 handler 所需的全部服务依赖
 *
 * 由 createServer() 组装后注入，handler 自身不构造任何服务实例。
 */
export interface ProxyHandlerServices {
  logService: ProxyLogService
  /** 模型映射：根据 sourceModel 查找活跃映射 */
  findModelMapping: (sourceModel: string) => Promise<{ targetModel: string } | null | undefined>
  /** 按名称查找供应商（注入给 router 使用） */
  lookupProvider: (name: string) => Promise<Provider | undefined>
  /** 获取 debug 模式状态 */
  getDebugMode: () => boolean
  streamService: {
    convertSSEStream: (
      upstreamStream: ReadableStream<Uint8Array>,
      from: 'openai' | 'anthropic',
      to: 'openai' | 'anthropic',
      ctx: any
    ) => ReadableStream<Uint8Array>
    sanitizeResponseHeaders: (headers: Headers) => Record<string, string>
  }
}

/**
 * Hono 路由环境类型
 * Variables.apiKey: 认证中间件注入的已验证 API Key 信息
 */
export interface AppEnv {
  Variables: {
    apiKey: { id: number; name: string; rate_limit: number }
  }
}

/**
 * 创建代理请求处理函数
 *
 * @param services - 注入的服务依赖
 * @returns handleProxyRequest 函数
 */
export function createProxyHandler(services: ProxyHandlerServices) {
  const { logService, findModelMapping, lookupProvider, getDebugMode, streamService } = services

  /**
   * 提取并脱敏客户端请求头。
   * authorization 和 x-api-key 只保留后 4 位，其余原样返回。
   *
   * @param headers - 原始请求头
   * @returns 脱敏后的请求头键值对
   */
  function extractClientHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((v, k) => {
      result[k] = k === 'authorization' || k === 'x-api-key' ? '***' + v.slice(-4) : v
    })
    return result
  }

  /**
   * 协议格式转换（客户端格式 ≠ 供应商格式时触发）。
   * 转换请求体和路径，失败时返回 502 错误 Response。
   */
  function convertIfNeeded(
    proxyBody: any, proxyPath: string, apiFormat: 'anthropic' | 'openai',
    route: any, requestPath: string, bodyModel: string, debugInfo: LogDebugInfo | null
  ): { proxyBody: any; proxyPath: string } | Response {
    try {
      const converted = convertRequest(proxyBody, apiFormat, route.provider.providerType as 'openai' | 'anthropic')
      logger().info('CONVERSION', {
        from: apiFormat, to: route.provider.providerType,
        originalPath: proxyPath, convertedPath: converted.path,
        originalModel: proxyBody.model, convertedModel: converted.body.model,
        convertedBody: JSON.stringify(converted.body).slice(0, MAX_LOG_BODY_LENGTH),
      })
      if (debugInfo) {
        debugInfo.conversion = {
          from: apiFormat, to: route.provider.providerType as string,
          originalPath: requestPath, convertedPath: converted.path,
          originalModel: bodyModel, convertedModel: converted.body.model
        }
      }
      return { proxyBody: converted.body, proxyPath: converted.path }
    } catch (convErr: any) {
      logger().warn('CONVERSION_ERROR', { error: convErr.message })
      return new Response(
        JSON.stringify({ error: `protocol_conversion_failed: ${convErr.message}` }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      )
    }
  }

  /**
   * 模型路由解析：模型映射 + 供应商匹配 + 协议转换。
   *
   * @param model - 客户端传入的模型 ID
   * @param requestPath - 原始请求路径
   * @param apiFormat - 客户端 API 格式
   * @param body - 原始请求体
   * @param debugInfo - 调试信息对象（可选）
   * @returns 路由结果对象或错误 Response
   */
  async function resolveRoute(
    model: string, requestPath: string, apiFormat: 'anthropic' | 'openai',
    body: any, debugInfo: LogDebugInfo | null
  ): Promise<{ route: any; proxyBody: any; proxyPath: string; needsConversion: boolean } | Response> {
    const mapping = await findModelMapping(model)
    const resolvedModel = mapping ? mapping.targetModel : model
    if (debugInfo && mapping) {
      logger().info('MODEL_MAPPING', { sourceModel: model, targetModel: mapping.targetModel })
    }

    const route = await resolveProvider(resolvedModel, lookupProvider)
    logger().info('ROUTE_RESOLVED', {
      providerName: route.provider.name, providerType: route.provider.providerType,
      providerBaseUrl: route.provider.baseUrl, modelName: route.modelName,
      needsConversion: apiFormat !== route.provider.providerType,
    })
    if (debugInfo) {
      debugInfo.route = {
        providerName: route.provider.name, providerType: route.provider.providerType,
        baseUrl: route.provider.baseUrl, modelName: route.modelName
      }
    }

    const needsConversion = apiFormat !== route.provider.providerType
    let proxyPath = requestPath
    let proxyBody: any = { ...body, model: route.modelName }

    if (needsConversion) {
      const result = convertIfNeeded(proxyBody, proxyPath, apiFormat, route, requestPath, body.model, debugInfo)
      if (result instanceof Response) return result
      proxyBody = result.proxyBody
      proxyPath = result.proxyPath
    }
    return { route, proxyBody, proxyPath, needsConversion }
  }

  /**
   * 构建上游请求头：透传 content-type / anthropic-beta + 供应商认证头。
   * 同时返回脱敏版本用于日志记录。
   */
  function buildUpstreamHeaders(
    c: Context<AppEnv>, route: any
  ): { proxyHeaders: Record<string, string>; sanitizedHeaders: Record<string, string> } {
    const originalHeaders: Record<string, string> = {}
    const contentType = c.req.header('content-type')
    if (contentType) originalHeaders['content-type'] = contentType
    const anthropicBeta = c.req.header('anthropic-beta')
    if (anthropicBeta && route.provider.providerType === 'anthropic') {
      originalHeaders['anthropic-beta'] = anthropicBeta
    }
    const proxyHeaders = buildProxyHeaders(route.provider, route.provider.apiKey, originalHeaders)
    const sanitizedHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(proxyHeaders)) {
      sanitizedHeaders[k] = k.toLowerCase() === 'authorization' || k.toLowerCase() === 'x-api-key'
        ? '***' + v.slice(-4) : v
    }
    return { proxyHeaders, sanitizedHeaders }
  }

  /**
   * 构建上游请求并发送 fetch，返回响应和日志基础信息。
   */
  async function buildAndFetchUpstream(
    c: Context<AppEnv>, route: any, proxyBody: any, proxyPath: string,
    model: string, apiFormat: 'anthropic' | 'openai',
    startTime: number, debugInfo: LogDebugInfo | null
  ): Promise<{ response: Response; logBase: any }> {
    const url = buildProxyUrl(route.provider, proxyPath)
    if (debugInfo) {
      debugInfo.upstream.url = url
      debugInfo.upstream.body = JSON.stringify(proxyBody)
    }

    const { proxyHeaders, sanitizedHeaders } = buildUpstreamHeaders(c, route)
    logger().info('UPSTREAM_REQUEST', {
      url, method: 'POST', headers: sanitizedHeaders,
      body: JSON.stringify(proxyBody).slice(0, MAX_LOG_BODY_LENGTH), stream: !!proxyBody.stream,
    })

    const response = await fetch(url, {
      method: 'POST', headers: proxyHeaders, body: JSON.stringify(proxyBody)
    })
    logger().info('UPSTREAM_RESPONSE', {
      status: response.status, ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    })

    const logBase = {
      apiKeyId: c.var.apiKey.id, providerId: route.provider.id,
      model: proxyBody.model, apiFormat, statusCode: response.status,
      durationMs: Date.now() - startTime
    }
    return { response, logBase }
  }

  /**
   * 处理上游错误响应（非 2xx）。
   * 读取错误体，根据是否需要协议转换决定透传或转换格式。
   */
  function handleErrorResponse(
    c: Context<AppEnv>,
    response: Response,
    route: any,
    needsConversion: boolean,
    apiFormat: 'anthropic' | 'openai',
    logBase: any,
    debugInfo: LogDebugInfo | null
  ): Promise<Response> {
    return response.text().catch(
      () => `(failed to read error body: ${response.status})`
    ).then((errorText) => {
      logger().warn('UPSTREAM_ERROR_BODY', { status: response.status, body: errorText.slice(0, MAX_LOG_BODY_LENGTH) })
      let errorBody: any
      let isJson = false
      try { errorBody = JSON.parse(errorText); isJson = true }
      catch { errorBody = { error: { message: errorText.slice(0, 500) } } }

      if (!needsConversion && !isJson) {
        if (debugInfo) { debugInfo.upstream.statusCode = response.status; debugInfo.upstream.responseBody = errorText }
        logService.tryLogEntry({ ...logBase, error: `Upstream ${response.status}: ${errorText.slice(0, 200)}`, debug: debugInfo ?? undefined })
        return c.body(errorText, response.status as any)
      }

      const convertedError = needsConversion
        ? convertResponse(errorBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat) : errorBody
      if (debugInfo) { debugInfo.upstream.statusCode = response.status; debugInfo.upstream.responseBody = errorText }
      const errMsg = errorBody?.error?.message || errorBody?.error || errorText.slice(0, 200)
      logService.tryLogEntry({ ...logBase, error: typeof errMsg === 'string' ? errMsg : String(errMsg).slice(0, 200), debug: debugInfo ?? undefined })
      return c.json(convertedError, response.status as any)
    })
  }

  /**
   * 处理流式 SSE 响应。
   * tee() 拆分流：一份给客户端，一份异步提取 token 用量写日志。
   */
  function handleStreamResponse(
    c: Context<AppEnv>,
    response: Response,
    route: any,
    needsConversion: boolean,
    apiFormat: 'anthropic' | 'openai',
    logBase: any,
    debugInfo: LogDebugInfo | null
  ): Response {
    const [forClient, forLogging] = response.body!.tee()
    if (debugInfo) debugInfo.upstream.statusCode = response.status

    if (needsConversion) {
      const ctx = createStreamContext()
      const convertedStream = streamService.convertSSEStream(
        forClient, route.provider.providerType as 'openai' | 'anthropic', apiFormat, ctx
      )
      logService.extractAndLogSSE(forLogging, logBase, route.provider.providerType as 'anthropic' | 'openai', debugInfo ?? undefined).catch((e) => logger().debug('SSE log extraction failed', { error: e instanceof Error ? e.message : String(e) }))
      return new Response(convertedStream, { status: response.status, headers: streamService.sanitizeResponseHeaders(response.headers) })
    }

    logService.extractAndLogSSE(forLogging, logBase, apiFormat, debugInfo ?? undefined).catch((e) => logger().debug('SSE log extraction failed', { error: e instanceof Error ? e.message : String(e) }))
    return new Response(forClient, { status: response.status, headers: streamService.sanitizeResponseHeaders(response.headers) })
  }

  /**
   * 处理非流式 JSON 响应。
   * 协议转换 + 提取 token 用量 + 写入日志。
   */
  async function handleNonStreamResponse(
    c: Context<AppEnv>,
    response: Response,
    route: any,
    needsConversion: boolean,
    apiFormat: 'anthropic' | 'openai',
    logBase: any,
    debugInfo: LogDebugInfo | null
  ): Promise<Response> {
    const responseBody = await response.json()
    logger().info('UPSTREAM_SUCCESS_BODY', { body: JSON.stringify(responseBody).slice(0, MAX_LOG_BODY_LENGTH) })
    const convertedBody = needsConversion
      ? convertResponse(responseBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat) : responseBody
    if (debugInfo) { debugInfo.upstream.statusCode = response.status; debugInfo.upstream.responseBody = JSON.stringify(responseBody) }

    let tokensIn = 0, tokensOut = 0
    if (apiFormat === 'openai' && convertedBody.usage) {
      tokensIn = convertedBody.usage.prompt_tokens ?? 0
      tokensOut = convertedBody.usage.completion_tokens ?? 0
    } else if (apiFormat === 'anthropic' && convertedBody.usage) {
      tokensIn = convertedBody.usage.input_tokens ?? 0
      tokensOut = convertedBody.usage.output_tokens ?? 0
    }
    logService.tryLogEntry({ ...logBase, tokensIn, tokensOut, debug: debugInfo ?? undefined })
    return c.json(convertedBody, response.status as any)
  }

  /**
   * 核心代理处理函数（编排器）。
   *
   * 完整请求生命周期：
   *   1. 解析请求体 + 提取/脱敏客户端请求头
   *   2. 模型映射 + 路由解析 + 协议转换
   *   3. 构建上游请求 + fetch
   *   4. 按响应类型分发：错误 / 流式 SSE / 非流式 JSON
   *   5. 捕获异常并映射为 HTTP 状态码
   *
   * @param c - Hono 请求上下文（含已认证的 apiKey）
   * @param requestPath - 请求路径（/v1/chat/completions 或 /v1/messages）
   * @param apiFormat - 客户端使用的 API 格式
   */
  async function handleProxyRequest(
    c: Context<AppEnv>,
    requestPath: string,
    apiFormat: 'anthropic' | 'openai'
  ): Promise<Response> {
    const startTime = Date.now()
    const debugInfo: LogDebugInfo | null = getDebugMode() ? {
      client: { body: '', apiFormat },
      route: { providerName: '', providerType: '', baseUrl: '', modelName: '' },
      upstream: { url: '', body: '', statusCode: 0, responseBody: '' }
    } : null
    try {
      const body = await c.req.json()
      const model = body.model
      const clientHeaders = extractClientHeaders(c.req.raw.headers)
      logger().info('CLIENT_REQUEST', {
        apiFormat, path: requestPath, clientModel: model,
        clientBody: JSON.stringify(body).slice(0, MAX_LOG_BODY_LENGTH), clientHeaders,
      })

      if (!model) return c.json({ error: 'model is required' }, 400)
      if (debugInfo) { debugInfo.client.body = JSON.stringify(body); debugInfo.client.apiFormat = apiFormat }

      // 路由解析（含模型映射 + 协议转换）
      const routeResult = await resolveRoute(model, requestPath, apiFormat, body, debugInfo)
      if (routeResult instanceof Response) return routeResult
      const { route, proxyBody, proxyPath, needsConversion } = routeResult

      // 构建上游请求并 fetch
      const { response, logBase } = await buildAndFetchUpstream(
        c, route, proxyBody, proxyPath, model, apiFormat, startTime, debugInfo
      )

      // 按响应类型分发
      if (!response.ok) return await handleErrorResponse(c, response, route, needsConversion, apiFormat, logBase, debugInfo)
      if (proxyBody.stream && response.body) return handleStreamResponse(c, response, route, needsConversion, apiFormat, logBase, debugInfo)
      return await handleNonStreamResponse(c, response, route, needsConversion, apiFormat, logBase, debugInfo)
    } catch (err) {
      return handleProxyError(c, err, startTime, apiFormat, debugInfo)
    }
  }

  /**
   * 代理请求异常处理
   *
   * 捕获路由失败、模型禁用、网络错误等未处理异常，
   * 根据错误消息映射为合适的 HTTP 状态码，并记录日志。
   *
   * 状态码映射（匹配 router.ts 的错误消息格式）：
   *   404 — 供应商未找到 / 模型不在白名单
   *   503 — 供应商已禁用
   *   400 — 模型 ID 格式错误
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
    logger().error('PROXY_ERROR', { error: message, stack: err instanceof Error ? err.stack?.slice(0, 1000) : undefined })
    let status: number = 502

    // 根据错误消息关键词映射 HTTP 状态码（匹配 router.ts 的错误格式）
    if (
      message.includes('provider not found') ||
      message.includes('model not in provider whitelist')
    ) {
      status = 404
    } else if (message.includes('provider is disabled')) {
      status = 503
    } else if (message.includes('Failed to parse model ID')) {
      status = 400
    }

    // 将错误信息写入 debugInfo（调试模式）
    if (debugInfo) {
      debugInfo.error = message
    }

    // 记录错误日志（model 为 unknown，因为路由可能已失败）
    logService.tryLogEntry({
      model: 'unknown',
      apiFormat,
      statusCode: status,
      durationMs: Date.now() - startTime,
      error: message,
      debug: debugInfo ?? undefined
    })

    return c.json({ error: message }, status as any)
  }

  return { handleProxyRequest }
}
