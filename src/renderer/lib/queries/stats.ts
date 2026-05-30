import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../shared/lib/api-client'
import type { DashboardStats, ProviderStatsGroup } from '../types'

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats', '7d'],
    queryFn: () => apiFetch('/v1/admin/logs/stats?range=7d').then(r => r.json()),
  })
}

export function useHourlyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '24h'],
    queryFn: () => apiFetch('/v1/admin/logs/stats-detailed?range=24h').then(r => r.json()),
  })
}

export function useDailyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '30d'],
    queryFn: () => apiFetch('/v1/admin/logs/stats-detailed?range=30d').then(r => r.json()),
  })
}
