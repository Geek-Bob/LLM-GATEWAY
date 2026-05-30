import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../shared/lib/api-client'
import type { LogEntry } from '../types'

interface LogsResult {
  logs: LogEntry[]
  total: number
}

export function useLogs(page: number, limit: number) {
  return useQuery<LogsResult>({
    queryKey: ['logs', page, limit],
    queryFn: () => apiFetch(`/v1/admin/logs/query?page=${page}&limit=${limit}`).then(r => r.json()),
  })
}
