import { useQuery } from '@tanstack/react-query'
import { api } from '../ipc'
import type { DashboardStats, ProviderStatsGroup } from '../types'

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
