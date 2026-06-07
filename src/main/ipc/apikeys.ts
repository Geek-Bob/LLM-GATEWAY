/**
 * API Key IPC handlers — API 密钥 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createApiKeySchema } from '../domains/apikey/apikey.schema'

/**
 * 注册 API Key 相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerApiKeyHandlers(db: Database): void {
  const apiKeyService = createApiKeyService(db)

  ipcMain.handle('apikey:list', async () => {
    return apiKeyService.list()
  })

  ipcMain.handle('apikey:create', async (_event, name: string, rateLimit?: number) => {
    const input = createApiKeySchema.parse({ name, rateLimit })
    return apiKeyService.create(input)
  })

  ipcMain.handle('apikey:delete', async (_event, id: number) => {
    return apiKeyService.remove(id)
  })
}
