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
 */

import { createServer } from './server'
import { serve, type ServerType } from '@hono/node-server'

let server: ServerType | null = null
let currentPort = 8080
let debugMode = true

export interface ProxyConfig {
  port: number
  running: boolean
  url: string | null
}

/** 获取当前是否启用了 debug 模式（debug 信息会记录到日志中）。 */
export function getDebugMode(): boolean {
  return debugMode
}

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
 */
export function startProxy(port?: number): boolean {
  if (server) return true
  if (port !== undefined) currentPort = port

  try {
    const app = createServer()
    server = serve({ fetch: app.fetch, port: currentPort })
    console.log(`[Proxy] started on http://localhost:${currentPort}`)
    return true
  } catch (err) {
    console.error('[Proxy] failed to start:', err)
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
    console.log('[Proxy] stopped')
  } catch (err) {
    console.error('[Proxy] error stopping:', err)
  }
  server = null
}

/** 重启代理服务器，可选指定新端口。 */
export function restartProxy(port?: number): boolean {
  stopProxy()
  return startProxy(port)
}
