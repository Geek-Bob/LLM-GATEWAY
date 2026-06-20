import type { Database } from '../../db/database'
import { createLogStatsRepository } from '../../db/logs-stats'
import type { RangeSummary } from '../../../shared/types'
import type { StatsQuery, StatsResponse } from './stats.types'

/**
 * 创建统计业务服务
 * 当前仅提供概要统计功能，为 Dashboard 页面提供数据支撑
 * 详细统计能力由 logs domain 的 detailedStats 提供
 */
export function createStatsService(db: Database) {
  const statsRepo = createLogStatsRepository(db)

  return {
    /**
     * 获取指定时间范围的概要统计（总请求数、成功率、Token 用量、缓存 token、总费用）。
     * 透传 statsRepo.getStats 返回的 total_cache_tokens 与 total_cost，完成 snake→camelCase 映射。
     */
    summary: async (query: StatsQuery): Promise<StatsResponse> => {
      const row = await statsRepo.getStats(query.range)
      return {
        totalRequests: Number(row.total_requests) || 0,
        totalTokensIn: Number(row.total_tokens_in) || 0,
        totalTokensOut: Number(row.total_tokens_out) || 0,
        cacheTokens: Number(row.total_cache_tokens) || 0,
        avgDurationMs: Number(row.avg_duration_ms) || 0,
        totalErrors: Number(row.total_errors) || 0,
        totalCost: Number(row.total_cost) || 0
      }
    },

    /**
     * 获取 24h / 30d 全局汇总（token 三分 + 费用三分 + totalRequests）。
     * 委派 statsRepo.getRangeSummary 并完成 snake→camelCase 映射为 RangeSummary 契约。
     * totalTokens 按 RangeSummary 契约定义为 inputTokens + outputTokens（service 层重算，不依赖 db 层补算）。
     * @param range - '24h' | '30d'
     */
    summaryDetailed: async (range: '24h' | '30d'): Promise<RangeSummary> => {
      const row = await statsRepo.getRangeSummary(range)
      const inputTokens = Number(row.input_tokens) || 0
      const outputTokens = Number(row.output_tokens) || 0
      return {
        totalTokens: inputTokens + outputTokens,
        inputTokens,
        cacheTokens: Number(row.cache_tokens) || 0,
        uncachedTokens: Number(row.uncached_tokens) || 0,
        outputTokens,
        totalCost: Number(row.total_cost) || 0,
        cacheCost: Number(row.cache_cost) || 0,
        uncachedCost: Number(row.uncached_cost) || 0,
        outputCost: Number(row.output_cost) || 0,
        totalRequests: Number(row.total_requests) || 0
      }
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
