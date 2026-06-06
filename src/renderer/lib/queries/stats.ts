/**
 * 统计报表查询 Hooks
 *
 * 封装的 IPC 通道：logs.stats / logs.statsDetailed
 *
 * 三个统计维度：
 * - useDashboardStats: 7 天概览统计（DashboardStats），queryKey=['stats', '7d']
 * - useHourlyStats: 24 小时明细统计（ProviderStatsGroup[]），queryKey=['stats', '24h']
 * - useDailyStats: 30 天日维度的明细统计（ProviderStatsGroup[]），queryKey=['stats', '30d']
 *
 * 缓存策略：每个时间窗口独占独立 queryKey，避免数据混淆。
 * 只读查询，不需要 mutation 或 invalidate。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { DashboardStats, ProviderStatsGroup } from '@/lib/types'

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats', '7d'],
    queryFn: () => api.logs.stats('7d'),
  })
}

export function useHourlyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '24h'],
    queryFn: () => api.logs.statsDetailed('24h'),
  })
}

export function useDailyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '30d'],
    queryFn: () => api.logs.statsDetailed('30d'),
  })
}
