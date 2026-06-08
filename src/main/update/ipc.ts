import { ipcMain } from 'electron'
import { UpdateManager } from './manager'
import type { UpdateConfig } from './config'
import { wrapIpcHandler } from '../ipc/ipc-utils'

/**
 * 注册自动更新相关的 IPC 处理器
 * 桥接渲染进程的更新操作请求与主进程的 UpdateManager
 * 所有处理器以 'update:' 为前缀，便于渲染进程通过 window.electronAPI 调用
 */
export function setupUpdateIpcHandlers(updateManager: UpdateManager): void {
  /** 检查更新 -> UpdateCheckResult */
  ipcMain.handle('update:check', wrapIpcHandler(async () => {
    return updateManager.checkForUpdates()
  }, 'update:check'))

  /** 开始下载更新 */
  ipcMain.handle('update:download', wrapIpcHandler(async () => {
    return updateManager.downloadUpdate()
  }, 'update:download'))

  /** 安装更新并重启 */
  ipcMain.handle('update:install', wrapIpcHandler(async () => {
    await updateManager.installUpdate()
    return { success: true }
  }, 'update:install'))

  /** 跳过指定版本号 */
  ipcMain.handle('update:skipVersion', wrapIpcHandler(async (_event, version: string) => {
    updateManager.skipVersion(version)
    return { success: true }
  }, 'update:skipVersion'))

  /** 获取当前更新配置 */
  ipcMain.handle('update:getConfig', wrapIpcHandler(async () => {
    return updateManager.getConfig()
  }, 'update:getConfig'))

  /** 更新配置项 */
  ipcMain.handle('update:setConfig', wrapIpcHandler(async (_event, config: Partial<UpdateConfig>) => {
    updateManager.updateConfig(config)
    return { success: true }
  }, 'update:setConfig'))

  /** 获取当前应用版本号 */
  ipcMain.handle('update:getCurrentVersion', wrapIpcHandler(async () => {
    return updateManager.getCurrentVersion()
  }, 'update:getCurrentVersion'))
}
