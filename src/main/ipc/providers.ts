/**
 * Provider IPC handlers — 供应商 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderSchema, updateProviderSchema } from '../domains/provider/provider.schema'

/**
 * 注册供应商相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerProviderHandlers(db: Database): void {
  const providerService = createProviderService(db)

  ipcMain.handle('provider:list', async () => {
    return providerService.list()
  })

  ipcMain.handle('provider:create', async (_event, data: unknown) => {
    const input = createProviderSchema.parse(data)
    return providerService.create(input)
  })

  ipcMain.handle('provider:update', async (_event, id: number, data: unknown) => {
    const input = updateProviderSchema.parse(data)
    return providerService.update(id, input)
  })

  ipcMain.handle('provider:delete', async (_event, id: number) => {
    return providerService.remove(id)
  })
}
