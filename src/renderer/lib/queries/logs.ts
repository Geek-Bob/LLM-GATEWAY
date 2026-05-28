import { useQuery } from '@tanstack/react-query'
import { api } from '../ipc'
import type { LogEntry } from '../types'

interface LogsResult {
  logs: LogEntry[]
  total: number
}

export function useLogs(page: number, limit: number) {
  return useQuery<LogsResult>({
    queryKey: ['logs', page, limit],
    queryFn: () => api.logs.query({ page, limit }),
  })
}
