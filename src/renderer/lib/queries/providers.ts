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
import { api } from '@/lib/ipc'
import type { Provider } from '@/lib/types'

/** 查询所有供应商列表。 @returns TanStack Query 结果，data 为 Provider 数组。 */
export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => api.providers.list(),
  })
}

/** 创建供应商 mutation，成功后自动刷新供应商列表缓存。 @returns TanStack Mutation 对象。 */
export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) =>
      api.providers.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

/** 更新供应商 mutation，成功后自动刷新供应商列表缓存。 @returns TanStack Mutation 对象。 */
export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.providers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

/** 删除供应商 mutation，成功后自动刷新供应商列表缓存。 @returns TanStack Mutation 对象。 */
export function useDeleteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api.providers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}
