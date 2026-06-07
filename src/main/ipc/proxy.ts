/**
 * Proxy IPC handlers — 代理服务器控制
 */

import { z } from 'zod'
import { ipcMain } from 'electron'
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'

const portSchema = z.number().int().min(1).max(65535).optional()
const requiredPortSchema = z.number().int().min(1).max(65535)
const debugModeSchema = z.boolean()

/**
 * 注册代理控制相关的 IPC handler
 * 无需数据库实例，代理管理器为模块级单例
 */
export function registerProxyHandlers(): void {
  ipcMain.handle('proxy:status', async () => {
    return getProxyConfig()
  })

  ipcMain.handle('proxy:start', async (_event, port?: unknown) => {
    const validPort = portSchema.parse(port)
    return startProxy(validPort)
  })

  ipcMain.handle('proxy:stop', async () => {
    stopProxy()
  })

  ipcMain.handle('proxy:restart', async (_event, port?: unknown) => {
    const validPort = portSchema.parse(port)
    return restartProxy(validPort)
  })

  ipcMain.handle('proxy:setPort', async (_event, port: unknown) => {
    const validPort = requiredPortSchema.parse(port)
    setProxyPort(validPort)
  })

  ipcMain.handle('proxy:getDebugMode', async () => {
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: unknown) => {
    const validEnabled = debugModeSchema.parse(enabled)
    setDebugMode(validEnabled)
  })
}
