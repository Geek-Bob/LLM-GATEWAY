/**
 * 日志业务服务
 *
 * 提供三种粒度的日志查询：原始记录、概要统计、按供应商/模型分组的详细统计。
 * 日志原始记录存储在 NDJSON 文件中（db/logs-reader.ts），统计预聚合在 SQLite 中。
 */

import type { Database } from '../../db/database'
import { queryLogs } from '../../db/logs'
import { createLogStatsRepository } from '../../db/logs-stats'
import { createProviderRepository } from '../../db/providers'
import type {
  LogQuery,
  LogQueryResponse,
  LogResponse,
  LogStatsResponse,
  DetailedStatsProvider,
} from './logs.types'

/**
 * 将 db 层 NDJSON 原始行（snake_case 字段）转换为对外的 LogResponse 契约。
 * 运行时安全：queryLogs 内部已通过 normalizeEntry 归一化字段名，类型断言无运行时风险。
 */
function logRowToResponse(row: Record<string, unknown>): LogResponse {
  // 保持 snake_case 直接透传，对齐前端 LogEntry 契约（Logs 页面按 snake_case 读取）
  return {
    id: Number(row.id ?? 0),
    api_key_id: (row.api_key_id as number | null | undefined) ?? null,
    provider_id: (row.provider_id as number | null | undefined) ?? null,
    model: (row.model as string | undefined) ?? '',
    api_format: (row.api_format as string | undefined) ?? '',
    status_code: Number(row.status_code ?? 0),
    tokens_in: Number(row.tokens_in ?? 0),
    tokens_out: Number(row.tokens_out ?? 0),
    cache_tokens: Number(row.cache_tokens ?? 0),
    duration_ms: Number(row.duration_ms ?? 0),
    error: (row.error as string | null | undefined) ?? null,
    created_at: (row.created_at as string | undefined) ?? '',
  }
}

/**
 * 创建日志业务服务
 * @param db - 注入的数据库实例
 */
export function createLogsService(db: Database) {
  const statsRepo = createLogStatsRepository(db)
  const providerRepo = createProviderRepository(db)

  return {
    /** 按条件查询原始日志记录，支持分页和过滤 */
    query: async (params: LogQuery): Promise<LogQueryResponse> => {
      const { logs, total } = queryLogs(params)
      return {
        logs: logs.map(logRowToResponse),
        total,
      }
    },

    /** 获取指定时间范围的概要统计（总请求数、Token 用量等） */
    stats: async (range: string): Promise<LogStatsResponse> => {
      const row = await statsRepo.getStats(range)
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
     * 将 db 返回的平铺行数据重组为嵌套结构，便于前端渲染 Dashboard 图表。
     * 每行已含 total_cache_tokens 与 cost（db 层 JOIN pricing 算好），
     * service 层完成 snake→camelCase 映射：model 维度跨时间点累加，dataPoint 维度单值透传。
     */
    detailedStats: async (range: '24h' | '30d'): Promise<DetailedStatsProvider[]> => {
      const rows = await statsRepo.getDetailedStats(range) as {
        provider_id: number; model: string;
        total_requests: number; total_tokens_in: number;
        total_tokens_out: number; total_cache_tokens: number;
        total_errors: number; period: number | string; cost: number
      }[]

      const providers = await providerRepo.listNames()

      // 第一层：按 provider_id 分组
      const providerMap = new Map<number, {
        providerId: number; providerName: string;
        models: Map<string, {
          model: string; totalRequests: number;
          totalTokensIn: number; totalTokensOut: number;
          cacheTokens: number; totalErrors: number; cost: number;
          dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number; cacheTokens: number; cost: number }[]
        }>
      }>()

      for (const row of rows) {
        const pid = row.provider_id
        const model = row.model
        if (!providerMap.has(pid)) {
          const p = providers.find((pr) => pr.id === pid)
          providerMap.set(pid, {
            providerId: pid,
            providerName: p?.name ?? `Provider #${pid}`,
            models: new Map()
          })
        }
        const pm = providerMap.get(pid)!
        if (!pm.models.has(model)) {
          pm.models.set(model, {
            model,
            totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0,
            cacheTokens: 0, totalErrors: 0, cost: 0,
            dataPoints: []
          })
        }
        const mm = pm.models.get(model)!
        mm.totalRequests += row.total_requests
        mm.totalTokensIn += row.total_tokens_in
        mm.totalTokensOut += row.total_tokens_out
        mm.cacheTokens += row.total_cache_tokens
        mm.totalErrors += row.total_errors
        mm.cost += row.cost
        mm.dataPoints.push({
          period: row.period,
          requests: row.total_requests,
          tokensIn: row.total_tokens_in,
          tokensOut: row.total_tokens_out,
          cacheTokens: row.total_cache_tokens,
          cost: row.cost
        })
      }

      return Array.from(providerMap.values()).map((p) => ({
        providerId: p.providerId,
        providerName: p.providerName,
        models: Array.from(p.models.values()).map((m) => ({
          model: m.model,
          totalRequests: m.totalRequests,
          totalTokensIn: m.totalTokensIn,
          totalTokensOut: m.totalTokensOut,
          cacheTokens: m.cacheTokens,
          totalErrors: m.totalErrors,
          cost: m.cost,
          dataPoints: m.dataPoints
        }))
      }))
    }
  }
}

export type LogsService = ReturnType<typeof createLogsService>
