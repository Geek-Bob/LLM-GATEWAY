/**
 * DataManagement IPC handler — 数据清空接口层
 *
 * 通道：`datamanagement:clear`（单数域，遵循 backend/32-interface-contracts.md 单实体规则）
 *
 * 职责（遵循 backend/32-interface-contracts.md）：
 * 1. 入口 Zod 校验：data 参数 unknown，经 clearDataSchema.parse(data) 校验
 * 2. 委派 service：调用 createDataManagementService(db).clear(input)
 * 3. 透传结果：返回值类型与 service 返回类型一致，不做额外转换
 *
 * handler 内不写 try/catch、不写业务逻辑——错误由 wrapIpcHandler 统一捕获映射
 * （见 backend/34-error-handling.md 统一包装要求）。
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createDataManagementService } from '../domains/datamanagement/datamanagement.service'
import { clearDataSchema } from '../domains/datamanagement/datamanagement.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册数据管理相关的 IPC handler
 * @param db - 注入的数据库实例（由入口层 setupIpcHandlers 传入）
 */
export function registerDataManagementHandlers(db: Database): void {
  const dataManagementService = createDataManagementService(db)

  ipcMain.handle('datamanagement:clear', wrapIpcHandler(async (_event, data: unknown) => {
    const input = clearDataSchema.parse(data)
    return dataManagementService.clear(input)
  }, 'datamanagement:clear'))
}
