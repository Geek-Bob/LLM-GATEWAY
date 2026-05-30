import { queryLogs, getLogStats, getDetailedStats } from '../../db/logs'
import { listProviders } from '../../db/providers'

export function createLogsService() {
  return {
    query: async (params: Record<string, unknown>) => {
      return queryLogs(params)
    },

    stats: async (range: string) => {
      return getLogStats({ range })
    },

    detailedStats: async (range: '24h' | '30d') => {
      const rows = getDetailedStats(range) as {
        provider_id: number; model: string;
        total_requests: number; total_tokens_in: number;
        total_tokens_out: number; total_errors: number;
        period: number | string
      }[]
      const providers = listProviders()

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
            totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, totalErrors: 0,
            dataPoints: []
          })
        }
        const mm = pm.models.get(model)!
        mm.totalRequests += row.total_requests
        mm.totalTokensIn += row.total_tokens_in
        mm.totalTokensOut += row.total_tokens_out
        mm.totalErrors += row.total_errors
        mm.dataPoints.push({
          period: row.period,
          requests: row.total_requests,
          tokensIn: row.total_tokens_in,
          tokensOut: row.total_tokens_out
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
          totalErrors: m.totalErrors,
          dataPoints: m.dataPoints
        }))
      }))
    }
  }
}

export type LogsService = ReturnType<typeof createLogsService>
