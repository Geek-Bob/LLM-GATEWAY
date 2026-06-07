/**
 * System IPC handlers — 窗口控制与渲染进程日志转发
 */

import { ipcMain, BrowserWindow } from 'electron'
import { createLogger } from '../core/logger'

const logger = createLogger('ipc')

/**
 * 注册系统级 IPC handler（窗口控制、渲染进程日志）
 * 无需数据库实例
 */
export function registerSystemHandlers(): void {
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.on('renderer:log', (_event, args: unknown[]) => {
    logger.debug('renderer', { args })
  })
}
