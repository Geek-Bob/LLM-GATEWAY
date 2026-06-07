/**
 * Log IPC handlers — 日志查询与详细统计
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createLogsService } from '../domains/logs/logs.service'
import { createStatsService } from '../domains/stats/stats.service'
import { queryLogsSchema, statsRangeSchema, detailedStatsRangeSchema } from '../domains/logs/logs.schema'

/**
 * 注册日志查询与统计相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerLogHandlers(db: Database): void {
  const logsService = createLogsService(db)
  const statsService = createStatsService(db)

  ipcMain.handle('logs:list', async (_event, params: unknown) => {
    const input = queryLogsSchema.parse(params)
    return logsService.query(input)
  })

  ipcMain.handle('logs:stats', async (_event, range: unknown) => {
    const { range: validRange } = statsRangeSchema.parse({ range })
    return statsService.summary({ range: validRange })
  })

  ipcMain.handle('logs:statsDetailed', async (_event, range: unknown) => {
    const { range: validRange } = detailedStatsRangeSchema.parse({ range })
    return logsService.detailedStats(validRange)
  })
}
