/**
 * Pricing IPC handlers — 供应商单价 CRUD
 *
 * 通道命名（单数域 pricing，遵循 backend/32-interface-contracts.md）：
 * - pricing:list          — 列出全部单价记录
 * - pricing:getByProvider — 列出指定供应商的全部单价记录
 * - pricing:upsert        — 插入或更新单条单价记录（幂等，同 providerId+model 触发 ON CONFLICT）
 * - pricing:delete        — 删除单条单价记录（不存在时不报错）
 *
 * 所有 handler 经 wrapIpcHandler 统一包装（handler 内不写 try/catch），
 * ZodError / 业务错误 / 系统错误由 ipc-utils.ts 映射为统一错误格式。
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Database } from '../db/database'
import { createPricingService } from '../domains/pricing/pricing.service'
import { createPricingSchema } from '../domains/pricing/pricing.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * pricing:delete 入参校验：(providerId, model) 联合主键
 */
const deletePricingSchema = z.object({
  providerId: z.number().int(),
  model: z.string().min(1)
})

/**
 * 注册单价相关的 IPC handler
 * @param db - 注入的数据库实例（由入口层获取后注入，保持依赖注入链）
 */
export function registerPricingHandlers(db: Database): void {
  const pricingService = createPricingService(db)

  ipcMain.handle('pricing:list', wrapIpcHandler(async () => {
    return pricingService.list()
  }, 'pricing:list'))

  // getByProvider 传裸 providerId 数字（preload 侧 ipcRenderer.invoke('...', providerId)），
  // 故直接校验裸数字而非对象，与 logs:stats 传裸 range 的模式一致
  ipcMain.handle('pricing:getByProvider', wrapIpcHandler(async (_event, data: unknown) => {
    const providerId = z.number().int().parse(data)
    return pricingService.getByProvider(providerId)
  }, 'pricing:getByProvider'))

  ipcMain.handle('pricing:upsert', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createPricingSchema.parse(data)
    return pricingService.upsert(input)
  }, 'pricing:upsert'))

  ipcMain.handle('pricing:delete', wrapIpcHandler(async (_event, data: unknown) => {
    const { providerId, model } = deletePricingSchema.parse(data)
    return pricingService.remove(providerId, model)
  }, 'pricing:delete'))
}
