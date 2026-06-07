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
import { createLogger } from '../core/logger'
import type { ProxyLogService } from './logger'
import type { LogDebugInfo, Provider } from '../../shared/types'

const logger = createLogger('proxy:handler')

/**
 * 代理 handler 所需的全部服务依赖
 *
 * 由 createServer() 组装后注入，handler 自身不构造任何服务实例。
 */
export interface ProxyHandlerServices {
  logService: ProxyLogService
  /** 模型映射：根据 sourceModel 查找活跃映射 */
  findModelMapping: (sourceModel: string) => { targetModel: string } | null | undefined
  /** 按名称查找供应商（注入给 router 使用） */
  lookupProvider: (name: string) => Provider | undefined
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
   * 核心代理处理函数
   *
   * 完整请求生命周期：
   *   1. 解析客户端请求体，提取 model
   *   2. resolveProvider(model) -> 路由到对应上游供应商
   *   3. 协议转换（如客户端用 OpenAI 格式但供应商是 Anthropic）
   *   4. 构建上游请求 URL + Headers，fetch 上游
   *   5. 处理响应：错误透传 / 流式 SSE / 非流式 JSON
   *   6. 提取 token 用量，写入日志（NDJSON + SQLite 统计）
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

      // 记录客户端请求（截断 body 避免日志过大，authorization 只保留后 4 位）
      const clientHeaders: Record<string, string> = {}
      c.req.raw.headers.forEach((v, k) => {
        clientHeaders[k] = k === 'authorization' ? '***' + v.slice(-4) : v
      })
      logger.info('CLIENT_REQUEST', {
        apiFormat,
        path: requestPath,
        clientModel: model,
        clientBody: JSON.stringify(body).slice(0, 4000),
        clientHeaders,
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
      const mapping = findModelMapping(model)
      const resolvedModel = mapping ? mapping.targetModel : model

      // 记录映射结果（调试模式）
      if (debugInfo && mapping) {
        logger.info('MODEL_MAPPING', { sourceModel: model, targetModel: mapping.targetModel })
      }

      // 路由解析：根据 resolvedModel 名称匹配供应商 + 解析出上游实际模型名
      const route = resolveProvider(resolvedModel, lookupProvider)
      const decryptedKey = route.provider.apiKey

      // 记录路由解析结果
      logger.info('ROUTE_RESOLVED', {
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
      // 例如：客户端发 OpenAI 格式 -> 供应商只支持 Anthropic 格式
      const needsConversion = apiFormat !== route.provider.providerType
      let proxyPath = requestPath
      // 用上游实际模型名替换客户端传入的模型别名
      let proxyBody: any = { ...body, model: route.modelName }

      if (needsConversion) {
        try {
          // convertRequest: 转换请求体格式 + 路径（/v1/chat/completions ↔ /v1/messages）
          const converted = convertRequest(proxyBody, apiFormat, route.provider.providerType as 'openai' | 'anthropic')
          logger.info('CONVERSION', {
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
              originalPath: requestPath,
              convertedPath: proxyPath,
              originalModel: body.model,
              convertedModel: proxyBody.model
            }
          }
        } catch (convErr: any) {
          logger.info('CONVERSION_ERROR', { error: convErr.message })
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

      // 记录上游请求详情（authorization 脱敏：只保留后 4 位）
      const sanitizedHeaders: Record<string, string> = {}
      for (const [k, v] of Object.entries(proxyHeaders)) {
        sanitizedHeaders[k] = k.toLowerCase() === 'authorization' || k.toLowerCase() === 'x-api-key'
          ? '***' + v.slice(-4)
          : v
      }
      logger.info('UPSTREAM_REQUEST', {
        url,
        method: 'POST',
        headers: sanitizedHeaders,
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
      logger.info('UPSTREAM_RESPONSE', {
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

        logger.info('UPSTREAM_ERROR_BODY', { status: response.status, body: errorText.slice(0, 4000) })

        // 尝试解析 JSON，失败则构造标准错误格式
        let errorBody: any
        let isJson = false
        try {
          errorBody = JSON.parse(errorText)
          isJson = true
        } catch {
          errorBody = { error: { message: errorText.slice(0, 500) } }
        }

        // 场景1：无需转换 + 非 JSON -> 直接透传原始文本
        if (!needsConversion && !isJson) {
          if (debugInfo) {
            debugInfo.upstream.statusCode = response.status
            debugInfo.upstream.responseBody = errorText
          }
          logService.tryLogEntry({
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
        logService.tryLogEntry({ ...logBase, error: typeof errMsg === 'string' ? errMsg : String(errMsg).slice(0, 200), debug: debugInfo ?? undefined })
        return c.json(convertedError, response.status as any)
      }

      // --- 流式响应处理（SSE） ---
      if (proxyBody.stream && response.body) {
        // tee() 将一份流拆成两份：一份给客户端，一份用于提取 token 用量写日志
        const [forClient, forLogging] = response.body.tee()

        if (needsConversion) {
          // 需要协议转换：逐事件转换 SSE 格式（如 OpenAI -> Anthropic）
          const ctx = createStreamContext()
          const convertedStream = streamService.convertSSEStream(
            forClient,
            route.provider.providerType as 'openai' | 'anthropic',
            apiFormat,
            ctx
          )
          if (debugInfo) {
            debugInfo.upstream.statusCode = response.status
          }
          // 异步提取 token 用量并写日志（不阻塞客户端响应）
          logService.extractAndLogSSE(forLogging, logBase, route.provider.providerType as 'anthropic' | 'openai', debugInfo ?? undefined).catch(() => {})
          return new Response(convertedStream, {
            status: response.status,
            headers: streamService.sanitizeResponseHeaders(response.headers)
          })
        }

        // 无需转换：直接透传上游 SSE 流
        if (debugInfo) {
          debugInfo.upstream.statusCode = response.status
        }
        // 异步提取 token 用量并写日志
        logService.extractAndLogSSE(forLogging, logBase, apiFormat, debugInfo ?? undefined).catch(() => {})
        return new Response(forClient, {
          status: response.status,
          headers: streamService.sanitizeResponseHeaders(response.headers)
        })
      }

      // --- 非流式响应处理 ---
      // 解析上游 JSON 响应体
      const responseBody = await response.json()
      logger.info('UPSTREAM_SUCCESS_BODY', { body: JSON.stringify(responseBody).slice(0, 4000) })
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
      logService.tryLogEntry({ ...logBase, tokensIn, tokensOut, debug: debugInfo ?? undefined })
      return c.json(convertedBody, response.status as any)
    } catch (err) {
      // 捕获所有未处理异常（网络错误、JSON 解析失败等）
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
    logger.info('PROXY_ERROR', { error: message, stack: err instanceof Error ? err.stack?.slice(0, 1000) : undefined })
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
