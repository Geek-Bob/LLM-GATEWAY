/**
 * Update IPC handlers — 自动更新控制
 * 委托给 update/ipc.ts 中的 setupUpdateIpcHandlers
 */

import type { UpdateManager } from '../update/manager'
import { setupUpdateIpcHandlers } from '../update/ipc'

/**
 * 注册自动更新相关的 IPC handler
 * @param updateManager - 自动更新管理器实例
 */
export function registerUpdateHandlers(updateManager: UpdateManager): void {
  setupUpdateIpcHandlers(updateManager)
}
