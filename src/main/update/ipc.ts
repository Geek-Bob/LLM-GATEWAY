import { ipcMain } from 'electron'
import { UpdateManager } from './manager'
import type { UpdateConfig } from './config'

export function setupUpdateIpcHandlers(updateManager: UpdateManager): void {
  ipcMain.handle('update:check', async () => {
    return updateManager.checkForUpdates()
  })

  ipcMain.handle('update:download', async () => {
    return updateManager.downloadUpdate()
  })

  ipcMain.handle('update:install', async () => {
    updateManager.installUpdate()
  })

  ipcMain.handle('update:skip-version', async (_event, version: string) => {
    updateManager.skipVersion(version)
  })

  ipcMain.handle('update:get-config', async () => {
    return updateManager.getConfig()
  })

  ipcMain.handle('update:set-config', async (_event, config: Partial<UpdateConfig>) => {
    updateManager.updateConfig(config)
  })
}
