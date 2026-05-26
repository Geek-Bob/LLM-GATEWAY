import { createServer } from './server'
import { serve, type ServerType } from '@hono/node-server'

let server: ServerType | null = null
let currentPort = 8080
let debugMode = false

export interface ProxyConfig {
  port: number
  running: boolean
  url: string | null
}

export function getDebugMode(): boolean {
  return debugMode
}

export function setDebugMode(enabled: boolean): void {
  console.log(`[DEBUG MODE] setDebugMode(${enabled}) called`)
  debugMode = enabled
}

export function getProxyConfig(): ProxyConfig {
  return {
    port: currentPort,
    running: server !== null,
    url: server ? `http://localhost:${currentPort}` : null
  }
}

export function setProxyPort(port: number): void {
  currentPort = port
}

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

export function restartProxy(port?: number): boolean {
  stopProxy()
  return startProxy(port)
}
