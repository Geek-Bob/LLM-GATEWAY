/**
 * proxy/server.ts — HTTP 代理服务器入口
 *
 * 职责：注册 Hono 路由 + 中间件链，组装各子模块。
 *
 * 路由结构：
 *   POST /v1/chat/completions  → OpenAI 格式 Chat 请求
 *   POST /v1/messages          → Anthropic 格式 Chat 请求
 *   GET  /v1/models            → 列出所有可用模型
 *   GET  /health               → 健康检查
 *
 * 中间件链（/v1/*）：
 *   1. CORS — 允许跨域
 *   2. 认证 — 提取 Bearer token -> verifyApiKey -> 注入 c.var.apiKey
 *   3. 限流 — 滑动窗口，按 API Key 维度计数
 *
 * 请求生命周期：
 *   Client → auth → rateLimit → handleProxyRequest → [convertRequest] → fetch upstream
 *         → [convertResponse/convertSSEStream] → Client
 *         → tryLogEntry（异步写入日志 + 统计）
 *
 * 服务依赖通过 createServer() 参数注入，禁止直接导入 db/ 模块。
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware'
import { RateLimiter } from './rate-limiter'
import { createLogger } from '../core/logger'
import { createProxyHandler, type AppEnv, type ProxyHandlerServices } from './handler'
import { createProxyLogService, type LogEntryProps } from './logger'
import { createStreamService, sanitizeResponseHeaders } from './stream'
import { convertSSEEvent, createStreamContext } from './converter'
import type { Provider } from '../../shared/types'

const logger = createLogger('proxy:server')

/**
 * createServer 所需的全部外部服务依赖
 *
 * 由调用方（manager.ts / ipc/index.ts）组装后注入，
 * server 自身不构造任何 db/domains 层服务实例。
 */
export interface ProxyServices {
  /** API Key 验证（来自 db/api-keys） */
  verifyApiKey: (plaintextKey: string) => Promise<{ id: number; name: string; rate_limit: number } | null>
  /** 写入 NDJSON 日志（来自 db/logs） */
  createLogEntry: (entry: LogEntryProps) => void
  /** 更新全局请求统计（来自 db/logs） */
  updateRequestStats: (entry: { tokensIn?: number; tokensOut?: number; durationMs?: number; statusCode?: number }) => Promise<void>
  /** 更新供应商请求统计（来自 db/logs） */
  updateProviderStats: (entry: { providerId?: number; model: string; tokensIn?: number; tokensOut?: number; durationMs?: number; statusCode?: number }) => Promise<void>
  /** 模型映射服务（来自 domains/models） */
  modelsService: {
    getAllModels: () => Promise<Array<{ id: string; provider: string }>>
    findModelMapping: (sourceModel: string) => Promise<{ targetModel: string } | null | undefined>
  }
  /** 获取 debug 模式状态 */
  getDebugMode: () => boolean
  /** 按名称查找供应商（注入给 router 使用） */
  lookupProvider: (name: string) => Promise<Provider | undefined>
}

/**
 * 创建代理 HTTP 服务器
 *
 * @param services - 外部注入的服务依赖
 */
export function createServer(services: ProxyServices) {
  const app = new Hono<AppEnv>()
  const rateLimiter = new RateLimiter()

  // 组装子服务
  const logService = createProxyLogService({
    createLogEntry: services.createLogEntry,
    updateRequestStats: services.updateRequestStats,
    updateProviderStats: services.updateProviderStats,
  })

  const streamService = createStreamService({
    createStreamContext,
    convertSSEEvent,
  })

  const { modelsService } = services

  const handlerServices: ProxyHandlerServices = {
    logService,
    findModelMapping: (sourceModel: string) => modelsService.findModelMapping(sourceModel),
    lookupProvider: services.lookupProvider,
    getDebugMode: services.getDebugMode,
    streamService: {
      convertSSEStream: streamService.convertSSEStream,
      sanitizeResponseHeaders,
    },
  }

  const { handleProxyRequest } = createProxyHandler(handlerServices)

  // CORS 全局中间件：允许所有跨域请求
  app.use('*', cors())

  // 认证中间件（/v1/*）：提取 Bearer token -> verifyApiKey -> 设置 c.var.apiKey
  app.use('/v1/*', async (c, next) => {
    const authHeader = c.req.header('authorization')
    // 记录请求头用于调试（authorization 只保留后 4 位，避免泄露完整密钥）
    const allHeaders: Record<string, string> = {}
    c.req.raw.headers.forEach((v, k) => {
      allHeaders[k] = k === 'authorization' || k === 'x-api-key' ? '***' + v.slice(-4) : v
    })
    logger.info('REQUEST', { path: c.req.path, method: c.req.method, allHeaders })
    // 支持两种认证方式：Authorization: Bearer xxx 或 X-Api-Key: xxx
    const token = authMiddleware(authHeader) || c.req.header('x-api-key') || null
    if (!token) {
      logService.logAuthFailure(c.req, 'missing authorization header')
      return c.json({ error: 'unauthorized' }, 401)
    }
    // 从数据库验证 API Key 有效性
    const apiKey = services.verifyApiKey(token)
    if (!apiKey) {
      logger.warn('AUTH FAIL: invalid key', { tokenSuffix: '***' + token.slice(-4) })
      logService.logAuthFailure(c.req, 'invalid api key')
      return c.json({ error: 'unauthorized' }, 401)
    }
    logger.info('AUTH OK', { keyId: apiKey.id, keyName: apiKey.name })
    // 将已验证的 API Key 信息注入请求上下文，供后续中间件和路由使用
    c.set('apiKey', apiKey)
    await next()
  })

  // 限流中间件（/v1/*）：滑动窗口限流，按 API Key 维度计数
  // 每个 API Key 有独立的 rate_limit 配置，超限返回 429 + Retry-After 头
  app.use('/v1/*', async (c, next) => {
    const key = c.var.apiKey
    const result = rateLimiter.check(`apikey:${key.id}`, key.rate_limit)
    if (!result.isAllowed) {
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
      data: models.map((m: { id: string; provider: string }) => ({
        id: m.id,
        provider: m.provider,
        object: 'model'
      }))
    })
  })

  // GET /health — 健康检查端点
  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}
