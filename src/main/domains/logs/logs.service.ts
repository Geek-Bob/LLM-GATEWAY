/**
 * 日志业务服务
 *
 * 提供三种粒度的日志查询：原始记录、概要统计、按供应商/模型分组的详细统计。
 * 日志原始记录存储在 NDJSON 文件中（db/logs.ts），统计预聚合在 SQLite 中。
 * 通过工厂注入 Database 实例，避免直接调用 getDb()。
 */

import type { Database } from '../../db/database'
import { queryLogs, getLogStats, getDetailedStats } from '../../db/logs'
import type {
  LogQuery,
  LogQueryResponse,
  LogStatsResponse,
  DetailedStatsProvider,
} from './logs.types'

/**
 * 创建日志业务服务
 * @param db - 注入的数据库实例，用于查询供应商名称等关联数据
 */
export function createLogsService(db: Database) {
  return {
    /** 按条件查询原始日志记录，支持分页和过滤 */
    query: async (params: LogQuery): Promise<LogQueryResponse> => {
      return queryLogs(params)
    },

    /** 获取指定时间范围的概要统计（总请求数、Token 用量等） */
    stats: async (range: string): Promise<LogStatsResponse> => {
      const row = getLogStats(db, { range }) as Record<string, unknown>
      return {
        totalRequests: Number(row.total_requests ?? 0),
        totalTokensIn: Number(row.total_tokens_in ?? 0),
        totalTokensOut: Number(row.total_tokens_out ?? 0),
        avgDurationMs: Number(row.avg_duration_ms ?? 0),
        totalErrors: Number(row.total_errors ?? 0),
      }
    },

    /**
     * 获取详细统计，按供应商 -> 模型 -> 时间点分层组织
     * 将 db/logs 返回的平铺行数据重组为嵌套结构，便于前端渲染 Dashboard 图表
     */
    detailedStats: async (range: '24h' | '30d'): Promise<DetailedStatsProvider[]> => {
      const rows = getDetailedStats(range) as {
        provider_id: number; model: string;
        total_requests: number; total_tokens_in: number;
        total_tokens_out: number; total_errors: number;
        period: number | string
      }[]

      // 通过注入的 db 查询供应商名称，避免依赖 db/providers 模块
      const providers = db
        .prepare('SELECT id, name FROM providers')
        .all() as { id: number; name: string }[]

      // 第一层：按 provider_id 分组
      const providerMap = new Map<number, {
        providerId: number; providerName: string;
        models: Map<string, {
          model: string; totalRequests: number;
          totalTokensIn: number; totalTokensOut: number;
          totalErrors: number;
          dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[]
        }>
      }>()

      for (const row of rows) {
        const pid = row.provider_id
        const model = row.model
        // 供应商维度：初次遇到则创建条目，并查找真实名称
        if (!providerMap.has(pid)) {
          const p = providers.find((pr) => pr.id === pid)
          providerMap.set(pid, {
            providerId: pid,
            providerName: p?.name ?? `Provider #${pid}`,
            models: new Map()
          })
        }
        const pm = providerMap.get(pid)!
        // 模型维度：初次遇到则创建条目
        if (!pm.models.has(model)) {
          pm.models.set(model, {
            model,
            totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, totalErrors: 0,
            dataPoints: []
          })
        }
        const mm = pm.models.get(model)!
        // 累加汇总数据
        mm.totalRequests += row.total_requests
        mm.totalTokensIn += row.total_tokens_in
        mm.totalTokensOut += row.total_tokens_out
        mm.totalErrors += row.total_errors
        // 追加时间点明细数据
        mm.dataPoints.push({
          period: row.period,
          requests: row.total_requests,
          tokensIn: row.total_tokens_in,
          tokensOut: row.total_tokens_out
        })
      }

      // 将嵌套的 Map 结构转为纯对象数组输出
      return Array.from(providerMap.values()).map((p) => ({
        providerId: p.providerId,
        providerName: p.providerName,
        models: Array.from(p.models.values()).map((m) => ({
          model: m.model,
          totalRequests: m.totalRequests,
          totalTokensIn: m.totalTokensIn,
          totalTokensOut: m.totalTokensOut,
          totalErrors: m.totalErrors,
          dataPoints: m.dataPoints
        }))
      }))
    }
  }
}

export type LogsService = ReturnType<typeof createLogsService>
