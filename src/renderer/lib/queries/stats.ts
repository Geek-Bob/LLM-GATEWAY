/**
 * 统计报表查询 Hooks
 *
 * 封装的 IPC 通道：logs.stats / logs.statsDetailed / logs.rangeSummary
 *
 * 四个统计维度：
 * - useDashboardStats: 7 天概览统计（DashboardStats），queryKey=['stats', 'get', '7d']
 * - useHourlyStats: 24 小时明细统计（ProviderStatsGroup[]），queryKey=['stats', 'get', '24h']
 * - useDailyStats: 30 天日维度的明细统计（ProviderStatsGroup[]），queryKey=['stats', 'get', '30d']
 * - useRangeSummary: 24h / 30d 全局汇总（RangeSummary），queryKey=['stats', 'rangeSummary', range]
 *
 * 缓存策略：每个时间窗口独占独立 queryKey，避免数据混淆。
 * 只读查询，不需要 mutation 或 invalidate。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { DashboardStats, ProviderStatsGroup } from '@/lib/types'

/** 查询近 7 天概览统计数据。 @returns TanStack Query 结果，data 为 DashboardStats。 */
export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats', 'get', '7d'],
    queryFn: () => api.logs.stats('7d'),
  })
}

/** 查询近 24 小时明细统计数据。 @returns TanStack Query 结果，data 为 ProviderStatsGroup 数组。 */
export function useHourlyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', 'get', '24h'],
    queryFn: () => api.logs.statsDetailed('24h'),
  })
}

/** 查询近 30 天日维度明细统计数据。 @returns TanStack Query 结果，data 为 ProviderStatsGroup 数组。 */
export function useDailyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', 'get', '30d'],
    queryFn: () => api.logs.statsDetailed('30d'),
  })
}

/** 查询 24h / 30d 全局汇总统计（Token + 费用维度）。 @returns TanStack Query 结果，data 为 RangeSummary。 */
export function useRangeSummary(range: '24h' | '30d') {
  return useQuery({
    queryKey: ['stats', 'rangeSummary', range],
    queryFn: () => api.logs.rangeSummary(range),
  })
}
