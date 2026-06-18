/**
 * Log IPC handlers — 日志查询与详细统计
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createLogsService } from '../domains/logs/logs.service'
import { createStatsService } from '../domains/stats/stats.service'
import { queryLogsSchema, statsRangeSchema, detailedStatsRangeSchema } from '../domains/logs/logs.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册日志查询与统计相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerLogHandlers(db: Database): void {
  const logsService = createLogsService(db)
  const statsService = createStatsService(db)

  ipcMain.handle('logs:list', wrapIpcHandler(async (_event, params: unknown) => {
    const input = queryLogsSchema.parse(params)
    return logsService.query(input)
  }, 'logs:list'))

  ipcMain.handle('logs:stats', wrapIpcHandler(async (_event, range: unknown) => {
    const { range: validRange } = statsRangeSchema.parse({ range })
    return statsService.summary({ range: validRange })
  }, 'logs:stats'))

  ipcMain.handle('logs:statsDetailed', wrapIpcHandler(async (_event, range: unknown) => {
    const { range: validRange } = detailedStatsRangeSchema.parse({ range })
    return logsService.detailedStats(validRange)
  }, 'logs:statsDetailed'))

  /**
   * logs:rangeSummary — 24h / 30d 全局汇总（token 三分 + 费用三分 + totalRequests）
   *
   * 注意：此 handler 注册在 ipc/logs.ts（聚合域归 logs），但内部调用 statsService
   * （非 logsService），遵循设计文档 §4.5 调用链：summaryDetailed 由 stats domain 提供。
   */
  ipcMain.handle('logs:rangeSummary', wrapIpcHandler(async (_event, range: unknown) => {
    const { range: validRange } = detailedStatsRangeSchema.parse({ range })
    return statsService.summaryDetailed(validRange)
  }, 'logs:rangeSummary'))
}
