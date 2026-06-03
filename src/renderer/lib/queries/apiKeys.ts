/**
 * API Key 查询 Hooks
 *
 * 封装的 IPC 通道：apiKeys.list / apiKeys.create / apiKeys.delete
 *
 * TanStack Query 用法：
 * - useApiKeys: 列表查询，queryKey=['apiKeys']
 * - useCreateApiKey: mutation 成功时 invalidate 缓存
 * - useDeleteApiKey: 同上
 *
 * 缓存策略：写操作后 invalidate 'apiKeys'，确保列表即时刷新。
 * create 调用时 name 为必填，rateLimit 可选。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ApiKey } from '../types'

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['apiKeys'],
    queryFn: () => api.apiKeys.list(),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, rateLimit }: { name: string; rateLimit?: number }) =>
      api.apiKeys.create(name, rateLimit),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.apiKeys.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}
