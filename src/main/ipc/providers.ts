/**
 * Provider IPC handlers — 供应商 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderSchema, updateProviderSchema } from '../domains/provider/provider.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册供应商相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerProviderHandlers(db: Database): void {
  const providerService = createProviderService(db)

  ipcMain.handle('provider:list', wrapIpcHandler(async () => {
    return providerService.list()
  }, 'provider:list'))

  ipcMain.handle('provider:create', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createProviderSchema.parse(data)
    return providerService.create(input)
  }, 'provider:create'))

  ipcMain.handle('provider:update', wrapIpcHandler(async (_event, id: number, data: unknown) => {
    const input = updateProviderSchema.parse(data)
    return providerService.update(id, input)
  }, 'provider:update'))

  ipcMain.handle('provider:delete', wrapIpcHandler(async (_event, id: number) => {
    return providerService.remove(id)
  }, 'provider:delete'))
}
