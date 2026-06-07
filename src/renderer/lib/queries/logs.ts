/**
 * 日志查询 Hook
 *
 * 封装的 IPC 通道：logs.query（分页查询）
 *
 * 分页策略：
 * - page 和 limit 作为 queryKey 的一部分（['logs', page, limit]）
 * - 不同页码自动缓存独立条目，切换页码时不会互相污染
 * - 不需要 invalidate 因为日志是追加写入的，只读且不需要即时刷新
 *
 * 接口返回 { logs: LogEntry[], total: number } 支持 UI 分页控件计算总页数
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { LogEntry } from '@/lib/types'

interface LogsResult {
  logs: LogEntry[]
  total: number
}

/** 分页查询请求日志。 @param page - 页码。 @param limit - 每页条数。 @returns TanStack Query 结果，data 包含 logs 和 total。 */
export function useLogs(page: number, limit: number) {
  return useQuery<LogsResult>({
    queryKey: ['logs', page, limit],
    queryFn: () => api.logs.query({ page, limit }),
  })
}
