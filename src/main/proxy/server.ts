import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware'
import { RateLimiter } from './rate-limiter'
import { resolveProvider, getAllModels } from './router'
import { buildProxyUrl, buildProxyHeaders } from './forwarder'
import { convertRequest, convertResponse, convertSSEEvent, createStreamContext, type StreamContext } from './converter'
import { verifyApiKey } from '../db/api-keys'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { createLogEntry, updateRequestStats, updateProviderStats } from '../db/logs'
import { getDebugMode } from './manager'
import type { LogDebugInfo } from '../../shared/types'

const AUTH_LOG = path.join(os.tmpdir(), 'llm-gateway-auth-debug.log')
function authDebugLog(...args: any[]): void {
  try {
    const ts = new Date().toISOString()
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    fs.appendFileSync(AUTH_LOG, `[${ts}] ${msg}\n`)
  } catch {}
}

const PROXY_LOG = path.join(os.tmpdir(), 'llm-gateway-proxy-debug.log')
function proxyDebugLog(section: string, data: Record<string, any>): void {
  try {
    const ts = new Date().toISOString()
    const entry: Record<string, any> = { ts, section, ...data }
    // Sanitize sensitive fields in any headers-like object
    for (const key of ['headers', 'upstreamHeaders', 'clientHeaders']) {
      if (entry[key]) {
        const h: Record<string, string> = {}
        for (const [k, v] of Object.entries(entry[key] as Record<string, string>)) {
          h[k] = k === 'authorization' ? 'Bearer gtwy-...' : v
        }
        entry[key] = h
      }
    }
    const line = JSON.stringify(entry)
    fs.appendFileSync(PROXY_LOG, `${line}\n`)
  } catch {}
}

interface AppEnv {
  Variables: {
    apiKey: { id: number; name: string; rate_limit: number }
  }
}

export function createServer() {
  const app = new Hono<AppEnv>()
  const rateLimiter = new RateLimiter()

  // CORS
  app.use('*', cors())

  // Auth middleware for /v1/*
  app.use('/v1/*', async (c, next) => {
    const authHeader = c.req.header('authorization')
    const allHeaders: Record<string, string> = {}
    c.req.raw.headers.forEach((v, k) => { allHeaders[k] = k === 'authorization' ? v.slice(0, 20) + '...' : v })
    authDebugLog('REQUEST', { path: c.req.path, method: c.req.method, allHeaders })
    let token = authMiddleware(authHeader) || c.req.header('x-api-key') || null
    if (!token) {
      logAuthFailure(c, `missing authorization header`)
      return c.json({ error: 'unauthorized' }, 401)
    }
    const apiKey = verifyApiKey(token)
    if (!apiKey) {
      authDebugLog('AUTH FAIL: invalid key', { tokenPrefix: token.slice(0, 10) + '...' })
      logAuthFailure(c, `invalid api key`)
      return c.json({ error: 'unauthorized' }, 401)
    }
    authDebugLog('AUTH OK', { keyId: apiKey.id, keyName: apiKey.name })
    c.set('apiKey', apiKey)
    await next()
  })

  // Rate limit middleware for /v1/*
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

  // POST /v1/chat/completions - OpenAI format
  app.post('/v1/chat/completions', async (c) => {
    return handleProxyRequest(c, '/v1/chat/completions', 'openai')
  })

  // POST /v1/messages - Anthropic format
  app.post('/v1/messages', async (c) => {
    return handleProxyRequest(c, '/v1/messages', 'anthropic')
  })

  // GET /v1/models - list all models
  app.get('/v1/models', (c) => {
    const models = getAllModels()
    return c.json({
      data: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        object: 'model'
      }))
    })
  })

  // GET /health - health check
  app.get('/health', (c) => c.json({ status: 'ok' }))


  return app

  // --- Helper functions ---

  async function handleProxyRequest(
    c: Context<AppEnv>,
    path: string,
    apiFormat: 'anthropic' | 'openai'
  ): Promise<Response> {
    const startTime = Date.now()
    const debugEnabled = getDebugMode()
    const debugInfo: LogDebugInfo | null = debugEnabled ? {
      client: { body: '', apiFormat },
      route: { providerName: '', providerType: '', baseUrl: '', modelName: '' },
      upstream: { url: '', body: '', statusCode: 0, responseBody: '' }
    } : null
    try {
      const body = await c.req.json()
      const model = body.model

      proxyDebugLog('CLIENT_REQUEST', {
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

      if (debugInfo) {
        debugInfo.client.body = JSON.stringify(body)
        debugInfo.client.apiFormat = apiFormat
      }

      const route = resolveProvider(model)
      const decryptedKey = route.provider.apiKey

      proxyDebugLog('ROUTE_RESOLVED', {
        providerName: route.provider.name,
        providerType: route.provider.providerType,
        providerBaseUrl: route.provider.baseUrl,
        modelName: route.modelName,
        needsConversion: apiFormat !== route.provider.providerType,
      })

      if (debugInfo) {
        debugInfo.route = {
          providerName: route.provider.name,
          providerType: route.provider.providerType,
          baseUrl: route.provider.baseUrl,
          modelName: route.modelName
        }
      }

      // --- Protocol auto-conversion ---
      const needsConversion = apiFormat !== route.provider.providerType
      let proxyPath = path
      let proxyBody: any = { ...body, model: route.modelName }

      if (needsConversion) {
        try {
          const converted = convertRequest(proxyBody, apiFormat, route.provider.providerType as 'openai' | 'anthropic')
          proxyDebugLog('CONVERSION', {
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
          proxyDebugLog('CONVERSION_ERROR', { error: convErr.message })
          return c.json({ error: `protocol_conversion_failed: ${convErr.message}` }, 502)
        }
      }
      // --- End protocol auto-conversion ---

      const url = buildProxyUrl(route.provider, proxyPath)

      if (debugInfo) {
        debugInfo.upstream.url = url
        debugInfo.upstream.body = JSON.stringify(proxyBody)
      }

      const originalHeaders: Record<string, string> = {}
      const contentType = c.req.header('content-type')
      if (contentType) {
        originalHeaders['content-type'] = contentType
      }
      // Pass through anthropic-beta header if client sent it and provider is anthropic
      const anthropicBeta = c.req.header('anthropic-beta')
      if (anthropicBeta && route.provider.providerType === 'anthropic') {
        originalHeaders['anthropic-beta'] = anthropicBeta
      }

      const proxyHeaders = buildProxyHeaders(
        route.provider,
        decryptedKey,
        originalHeaders
      )

      proxyDebugLog('UPSTREAM_REQUEST', {
        url,
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify(proxyBody).slice(0, 4000),
        stream: !!proxyBody.stream,
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify(proxyBody)
      })

      proxyDebugLog('UPSTREAM_RESPONSE', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      })

      const logBase = {
        apiKeyId: c.var.apiKey.id,
        providerId: route.provider.id,
        model,
        apiFormat,
        statusCode: response.status,
        durationMs: Date.now() - startTime
      }

      // Handle error responses — convert error format
      if (!response.ok && !proxyBody.stream) {
        const errorBody = await response.json()
        proxyDebugLog('UPSTREAM_ERROR_BODY', { body: JSON.stringify(errorBody).slice(0, 4000) })
        const convertedError = needsConversion
          ? convertResponse(errorBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
          : errorBody

        if (debugInfo) {
          debugInfo.upstream.statusCode = response.status
          debugInfo.upstream.responseBody = JSON.stringify(errorBody)
        }
        tryLogEntry(c, { ...logBase, debug: debugInfo ?? undefined })
        return c.json(convertedError, response.status as any)
      }

      // Handle streaming
      if (proxyBody.stream && response.body) {
        const [forClient, forLogging] = response.body.tee()

        if (needsConversion) {
          const ctx = createStreamContext()
          const convertedStream = convertSSEStream(
            forClient,
            route.provider.providerType as 'openai' | 'anthropic',
            apiFormat,
            ctx
          )
          extractAndLogSSE(forLogging, logBase, route.provider.providerType as 'anthropic' | 'openai').catch(() => {})
          if (debugInfo) {
            debugInfo.upstream.statusCode = response.status
            debugInfo.upstream.responseBody = '(streaming — body not captured)'
          }
          return new Response(convertedStream, {
            status: response.status,
            headers: response.headers
          })
        }

        // No conversion needed — existing behavior
        extractAndLogSSE(forLogging, logBase, apiFormat).catch(() => {})
        if (debugInfo) {
          debugInfo.upstream.statusCode = response.status
          debugInfo.upstream.responseBody = '(streaming — body not captured)'
        }
        return new Response(forClient, {
          status: response.status,
          headers: response.headers
        })
      }

      // Handle non-streaming
      const responseBody = await response.json()
      proxyDebugLog('UPSTREAM_SUCCESS_BODY', { body: JSON.stringify(responseBody).slice(0, 4000) })
      const convertedBody = needsConversion
        ? convertResponse(responseBody, route.provider.providerType as 'openai' | 'anthropic', apiFormat)
        : responseBody

      if (debugInfo) {
        debugInfo.upstream.statusCode = response.status
        debugInfo.upstream.responseBody = JSON.stringify(convertedBody)
      }

      let tokensIn = 0
      let tokensOut = 0
      if (apiFormat === 'openai' && convertedBody.usage) {
        tokensIn = convertedBody.usage.prompt_tokens ?? 0
        tokensOut = convertedBody.usage.completion_tokens ?? 0
      } else if (apiFormat === 'anthropic' && convertedBody.usage) {
        tokensIn = convertedBody.usage.input_tokens ?? 0
        tokensOut = convertedBody.usage.output_tokens ?? 0
      }
      tryLogEntry(c, { ...logBase, tokensIn, tokensOut, debug: debugInfo ?? undefined })
      return c.json(convertedBody, response.status as any)
    } catch (err) {
      return handleProxyError(c, err, startTime, apiFormat)
    }
  }

  async function extractAndLogSSE(
    stream: ReadableStream<Uint8Array>,
    logBase: { apiKeyId: number; providerId?: number; model: string; apiFormat: 'anthropic' | 'openai'; statusCode: number; durationMs: number },
    apiFormat: 'anthropic' | 'openai'
  ): Promise<void> {
    try {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
      }
      const usage = extractUsageFromSSE(text, apiFormat)
      tryLogEntry(null as any, { ...logBase, ...usage })
    } catch {
      // Silent — logging is best-effort
    }
  }

  // SSE stream converter: reads upstream SSE events, converts format, writes to client
  function convertSSEStream(
    upstreamStream: ReadableStream<Uint8Array>,
    from: 'openai' | 'anthropic',
    to: 'openai' | 'anthropic',
    ctx: StreamContext
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    let buffer = ''
    let streamDone = false

    return new ReadableStream({
      async start(controller) {
        const reader = upstreamStream.getReader()
        const decoder = new TextDecoder()
        let currentEvent = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7)
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6)

                if (from === 'openai' && dataStr === '[DONE]') {
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

                if (streamDone) continue

                let parsedData: any
                try {
                  parsedData = JSON.parse(dataStr)
                } catch {
                  continue
                }

                const results = convertSSEEvent(currentEvent, parsedData, from, to, ctx)
                if (!results) continue

                const arr = Array.isArray(results) ? results : [results]
                for (const r of arr) {
                  if (!r) continue
                  const evt = r.event && r.event !== '' ? `event: ${r.event}\n` : ''
                  const dataJson = JSON.stringify(r.data)
                  controller.enqueue(encoder.encode(`${evt}data: ${dataJson}\n\n`))
                }

                currentEvent = ''
              }
              if (line === '') {
                currentEvent = ''
              }
            }
          }

          // Flush remaining buffer
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
          controller.error(err)
        }
      }
    })
  }

  function handleProxyError(
    c: Context<AppEnv>,
    err: unknown,
    startTime: number,
    apiFormat: 'anthropic' | 'openai'
  ): Response {
    const message = err instanceof Error ? err.message : String(err)
    proxyDebugLog('PROXY_ERROR', { error: message, stack: err instanceof Error ? err.stack?.slice(0, 1000) : undefined })
    let status: number = 502

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

    tryLogEntry(c, {
      model: 'unknown',
      apiFormat,
      statusCode: status,
      durationMs: Date.now() - startTime,
      error: message
    })

    return c.json({ error: message }, status as any)
  }

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
      // Silently ignore logging failures
    }
  }

  function logAuthFailure(c: Context, error: string): void {
    console.log(`[AUTH FAIL] ${c.req.method} ${c.req.path} - ${error}`)
    c.req.text().then(text => {
      try {
        const body = JSON.parse(text)
        authDebugLog('AUTH FAIL body', { model: body.model })
        createLogEntry({
          model: body.model || 'unknown',
          apiFormat: c.req.path.includes('/v1/chat/completions') ? 'openai' : 'anthropic',
          statusCode: 401,
          error
        })
      } catch { authDebugLog('AUTH FAIL body unparseable', { textLen: text?.length }) }
    }).catch(() => {})
  }

  function extractUsageFromSSE(
    text: string,
    apiFormat: 'anthropic' | 'openai'
  ): { tokensIn: number; tokensOut: number } {
    let tokensIn = 0
    let tokensOut = 0

    if (apiFormat === 'openai') {
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.usage) {
            tokensIn = data.usage.prompt_tokens ?? tokensIn
            tokensOut = data.usage.completion_tokens ?? tokensOut
          }
        } catch { /* skip malformed JSON */ }
      }
    } else {
      let eventType = ''
      for (const line of text.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'message_start' && data.message?.usage) {
              tokensIn = data.message.usage.input_tokens ?? tokensIn
              tokensOut = data.message.usage.output_tokens ?? tokensOut
            }
            if (eventType === 'message_delta' && data.usage) {
              tokensOut = data.usage.output_tokens ?? tokensOut
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    }

    return { tokensIn, tokensOut }
  }
}
