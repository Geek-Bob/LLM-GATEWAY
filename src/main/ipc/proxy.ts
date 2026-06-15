/**
 * Proxy IPC handlers — 代理服务器控制
 */

import { z } from 'zod'
import { ipcMain } from 'electron'
import { getProxyConfig, startProxy, stopProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'
import { wrapIpcHandler } from './ipc-utils'

const portSchema = z.number().int().min(1).max(65535).optional()
const requiredPortSchema = z.number().int().min(1).max(65535)
const debugModeSchema = z.boolean()

/**
 * 注册代理控制相关的 IPC handler
 * 无需数据库实例，代理管理器为模块级单例
 */
export function registerProxyHandlers(): void {
  ipcMain.handle('proxy:get', wrapIpcHandler(async () => {
    return { ...getProxyConfig(), debugMode: getDebugMode() }
  }, 'proxy:get'))

  ipcMain.handle('proxy:start', wrapIpcHandler(async (_event, port?: unknown) => {
    const validPort = portSchema.parse(port)
    return startProxy(validPort)
  }, 'proxy:start'))

  ipcMain.handle('proxy:stop', wrapIpcHandler(async () => {
    stopProxy()
    return { success: true }
  }, 'proxy:stop'))

  ipcMain.handle('proxy:updatePort', wrapIpcHandler(async (_event, port: unknown) => {
    const validPort = requiredPortSchema.parse(port)
    setProxyPort(validPort)
    return { success: true }
  }, 'proxy:updatePort'))

  ipcMain.handle('proxy:update', wrapIpcHandler(async (_event, enabled: unknown) => {
    const validEnabled = debugModeSchema.parse(enabled)
    setDebugMode(validEnabled)
    return { success: true }
  }, 'proxy:update'))
}
