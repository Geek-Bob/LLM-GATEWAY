/**
 * Model Mapping IPC handlers — 模型映射 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createModelsService } from '../domains/models/models.service'
import { createModelMappingSchema, updateModelMappingSchema } from '../domains/models/models.schema'

/**
 * 注册模型映射相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerModelHandlers(db: Database): void {
  const modelsService = createModelsService(db)

  ipcMain.handle('models:list', async () => modelsService.getAllModels())

  ipcMain.handle('models:mapping:find', async (_event, sourceModel: string) =>
    modelsService.findModelMapping(sourceModel)
  )

  ipcMain.handle('models:mapping:list', async () => modelsService.listModelMappings())

  ipcMain.handle('models:mapping:create', async (_event, data: unknown) => {
    const input = createModelMappingSchema.parse(data)
    return modelsService.createModelMapping(input)
  })

  ipcMain.handle('models:mapping:update', async (_event, { id, updates }: { id: number; updates: Record<string, unknown> }) => {
    const input = updateModelMappingSchema.parse(updates)
    return modelsService.updateModelMapping(id, input)
  })

  ipcMain.handle('models:mapping:delete', async (_event, id: number) =>
    modelsService.deleteModelMapping(id)
  )
}
