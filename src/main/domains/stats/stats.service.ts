import type { Database } from '../../db/database'
import { createLogStatsRepository } from '../../db/logs-stats'
import type { StatsQuery, StatsResponse } from './stats.types'

/**
 * 创建统计业务服务
 * 当前仅提供概要统计功能，为 Dashboard 页面提供数据支撑
 * 详细统计能力由 logs domain 的 detailedStats 提供
 */
export function createStatsService(db: Database) {
  const statsRepo = createLogStatsRepository(db)

  return {
    /** 获取指定时间范围的概要统计（总请求数、成功率、Token 用量等） */
    summary: async (query: StatsQuery): Promise<StatsResponse> => {
      const row = await statsRepo.getStats(query.range)
      return {
        totalRequests: row.total_requests as number,
        totalTokensIn: row.total_tokens_in as number,
        totalTokensOut: row.total_tokens_out as number,
        avgDurationMs: row.avg_duration_ms as number,
        totalErrors: row.total_errors as number
      }
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
