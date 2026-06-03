import { queryLogs, getLogStats, getDetailedStats, type LogQuery } from '../../db/logs'
import { listProviders } from '../../db/providers'

/**
 * 创建日志业务服务
 * 提供三种粒度的日志查询：原始记录、概要统计、按供应商/模型分组的详细统计
 */
export function createLogsService() {
  return {
    /** 按条件查询原始日志记录，支持分页和过滤 */
    query: async (params: LogQuery) => {
      return queryLogs(params)
    },

    /** 获取指定时间范围的概要统计（总请求数、Token 用量等） */
    stats: async (range: string) => {
      return getLogStats({ range })
    },

    /**
     * 获取详细统计，按供应商 -> 模型 -> 时间点分层组织
     * 将 db/logs 返回的平铺行数据重组为嵌套结构，便于前端渲染 Dashboard 图表
     */
    detailedStats: async (range: '24h' | '30d') => {
      const rows = getDetailedStats(range) as {
        provider_id: number; model: string;
        total_requests: number; total_tokens_in: number;
        total_tokens_out: number; total_errors: number;
        period: number | string
      }[]
      const providers = listProviders()

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
