/**
 * API Key 查询 Hooks
 *
 * 封装的 IPC 通道：apiKeys.list / apiKeys.create / apiKeys.delete
 *
 * TanStack Query 用法：
 * - useApiKeys: 列表查询，queryKey=['apiKeys', 'list']
 * - useCreateApiKey: mutation 成功时 invalidate 缓存
 * - useDeleteApiKey: 同上
 *
 * 缓存策略：写操作后 invalidate 'apiKeys'，确保列表即时刷新。
 * create 调用时 name 为必填，rateLimit 可选。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { ApiKey } from '@/lib/types'

/** 查询所有 API Key 列表。 @returns TanStack Query 结果，data 为 ApiKey 数组。 */
export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['apiKeys', 'list'],
    queryFn: () => api.apiKeys.list(),
  })
}

/** 创建 API Key mutation，成功后自动刷新列表缓存。 @returns TanStack Mutation 对象。 */
export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; rateLimit?: number }) =>
      api.apiKeys.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys', 'list'] }),
  })
}

/** 删除 API Key mutation，成功后自动刷新列表缓存。 @returns TanStack Mutation 对象。 */
export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.apiKeys.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys', 'list'] }),
  })
}
