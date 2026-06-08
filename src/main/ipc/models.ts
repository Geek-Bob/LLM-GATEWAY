/**
 * Model Mapping IPC handlers — 模型映射 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createModelsService } from '../domains/models/models.service'
import { createModelMappingSchema, updateModelMappingSchema } from '../domains/models/models.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册模型映射相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerModelHandlers(db: Database): void {
  const modelsService = createModelsService(db)

  ipcMain.handle('models:list', wrapIpcHandler(async () => modelsService.getAllModels(), 'models:list'))

  ipcMain.handle('models:mapping:find', wrapIpcHandler(async (_event, sourceModel: string) =>
    modelsService.findModelMapping(sourceModel)
  , 'models:mapping:find'))

  ipcMain.handle('models:mapping:list', wrapIpcHandler(async () => modelsService.listModelMappings(), 'models:mapping:list'))

  ipcMain.handle('models:mapping:create', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createModelMappingSchema.parse(data)
    return modelsService.createModelMapping(input)
  }, 'models:mapping:create'))

  ipcMain.handle('models:mapping:update', wrapIpcHandler(async (_event, { id, updates }: { id: number; updates: Record<string, unknown> }) => {
    const input = updateModelMappingSchema.parse(updates)
    return modelsService.updateModelMapping(id, input)
  }, 'models:mapping:update'))

  ipcMain.handle('models:mapping:delete', wrapIpcHandler(async (_event, id: number) =>
    modelsService.deleteModelMapping(id)
  , 'models:mapping:delete'))
}
