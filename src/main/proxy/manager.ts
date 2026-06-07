/**
 * 代理服务器生命周期管理器
 *
 * 负责管理 Hono 代理服务器的启停和端口配置。
 * 代理仅在 Chat 场景中使用，用于：
 * 1. 渲染进程通过 SSE 流与代理通信（/v1/chat/stream）
 * 2. 代理将请求转发到上游 LLM 供应商
 *
 * 关键设计：
 * - 单例模式：全局只有一个 server 实例，通过 start/stop/restart 控制
 * - 默认端口 8080，仅监听 localhost（安全要求）
 * - debugMode 控制是否记录请求/响应的详细 debug 信息
 *
 * 依赖注入：createServer() 所需的外部服务（verifyApiKey、日志、模型映射等）
 * 在 startProxy() 中组装并注入，保持 proxy/ 内部模块不直接依赖 db/ 层。
 */

import { createServer, type ProxyServices } from './server'
import { serve, type ServerType } from '@hono/node-server'
import { createLogger } from '../core/logger'

const logger = createLogger('proxy:manager')

let server: ServerType | null = null
let currentPort = 8080
let debugMode = true
/** 缓存的外部服务依赖，由 initProxyServices() 注入 */
let cachedServices: ProxyServices | null = null

export interface ProxyConfig {
  port: number
  running: boolean
  url: string | null
}

/**
 * 初始化代理服务依赖（在应用启动时调用一次）
 *
 * 由入口层（index.ts / ipc/index.ts）构造并注入，
 * manager 自身不直接导入 db/ 或 domains/ 模块。
 *
 * @param services - createServer 所需的全部外部服务
 */
export function initProxyServices(services: ProxyServices): void {
  cachedServices = services
}

/** 获取当前是否启用了 debug 模式（debug 信息会记录到日志中）。 */
export function getDebugMode(): boolean {
  return debugMode
}

/**
 * 设置代理 debug 模式开关。
 * debug 模式下会记录请求/响应的详细信息到日志中。
 * @param enabled - 是否启用 debug 模式
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}

/** 获取代理当前配置和运行状态。 */
export function getProxyConfig(): ProxyConfig {
  return {
    port: currentPort,
    running: server !== null,
    url: server ? `http://localhost:${currentPort}` : null
  }
}

/** 设置代理端口（需重启后生效）。 */
export function setProxyPort(port: number): void {
  currentPort = port
}

/**
 * 启动代理服务器。
 * 如果已有正在运行的实例则直接返回 true。
 * 失败时将 server 置为 null 并返回 false，调用方应检查返回值。
 *
 * 需要先调用 initProxyServices() 注入服务依赖。
 */
export function startProxy(port?: number): boolean {
  if (server) return true
  if (port !== undefined) currentPort = port

  if (!cachedServices) {
    logger.error('startProxy called before initProxyServices()')
    return false
  }

  try {
    const app = createServer(cachedServices)
    server = serve({ fetch: app.fetch, port: currentPort, hostname: '127.0.0.1' })
    logger.info('started', { port: currentPort })
    return true
  } catch (err) {
    logger.error('failed to start', { error: err instanceof Error ? err.message : String(err) })
    server = null
    return false
  }
}

/**
 * 停止代理服务器。
 * 幂等操作：如果服务器已停止则不做任何操作。
 */
export function stopProxy(): void {
  if (!server) return
  try {
    server.close()
    logger.info('stopped')
  } catch (err) {
    logger.error('error stopping', { error: err instanceof Error ? err.message : String(err) })
  }
  server = null
}

/** 重启代理服务器，可选指定新端口。 */
export function restartProxy(port?: number): boolean {
  stopProxy()
  return startProxy(port)
}
