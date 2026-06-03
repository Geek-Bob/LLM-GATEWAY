import { ipcMain } from 'electron'
import { UpdateManager } from './manager'
import type { UpdateConfig } from './config'

/**
 * 注册自动更新相关的 IPC 处理器
 * 桥接渲染进程的更新操作请求与主进程的 UpdateManager
 * 所有处理器以 'update:' 为前缀，便于渲染进程通过 window.electronAPI 调用
 */
export function setupUpdateIpcHandlers(updateManager: UpdateManager): void {
  /** 检查更新 -> UpdateCheckResult */
  ipcMain.handle('update:check', async () => {
    return updateManager.checkForUpdates()
  })

  /** 开始下载更新 */
  ipcMain.handle('update:download', async () => {
    return updateManager.downloadUpdate()
  })

  /** 安装更新并重启 */
  ipcMain.handle('update:install', async () => {
    await updateManager.installUpdate()
  })

  /** 跳过指定版本号 */
  ipcMain.handle('update:skip-version', async (_event, version: string) => {
    updateManager.skipVersion(version)
  })

  /** 获取当前更新配置 */
  ipcMain.handle('update:get-config', async () => {
    return updateManager.getConfig()
  })

  /** 更新配置项 */
  ipcMain.handle('update:set-config', async (_event, config: Partial<UpdateConfig>) => {
    updateManager.updateConfig(config)
  })

  /** 获取当前应用版本号 */
  ipcMain.handle('update:getCurrentVersion', async () => {
    return updateManager.getCurrentVersion()
  })
}
