/**
 * API Key IPC handlers — API 密钥 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createApiKeySchema } from '../domains/apikey/apikey.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册 API Key 相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerApiKeyHandlers(db: Database): void {
  const apiKeyService = createApiKeyService(db)

  ipcMain.handle('apikey:list', wrapIpcHandler(async () => {
    return apiKeyService.list()
  }, 'apikey:list'))

  ipcMain.handle('apikey:create', wrapIpcHandler(async (_event, data: { name: string; rateLimit?: number }) => {
    const input = createApiKeySchema.parse(data)
    return apiKeyService.create(input)
  }, 'apikey:create'))

  ipcMain.handle('apikey:delete', wrapIpcHandler(async (_event, id: number) => {
    return apiKeyService.remove(id)
  }, 'apikey:delete'))
}
