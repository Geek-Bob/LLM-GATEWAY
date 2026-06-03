/**
 * Provider 查询 Hooks
 *
 * 封装的 IPC 通道：providers.list / providers.create / providers.update / providers.delete
 *
 * TanStack Query 用法：
 * - useProviders: 列表查询，queryKey=['providers']
 * - useCreateProvider: mutation 成功后自动 invalidate 'providers' 缓存触发刷新
 * - useUpdateProvider: 同上
 * - useDeleteProvider: 同上
 *
 * 缓存策略：所有写操作（CUD）成功后 invalidate 'providers'，下次读取时自动重新 fetch。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { Provider } from '../types'

export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => api.providers.list(),
  })
}

export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) =>
      api.providers.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.providers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useDeleteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api.providers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}
