/**
 * ModelMapping 查询 Hooks
 *
 * 封装的 IPC 通道：models.mapping.list / models.mapping.create / models.mapping.update / models.mapping.delete
 *
 * TanStack Query 用法：
 * - useModelMappings: 列表查询，queryKey=['model-mappings']
 * - useModels: 模型列表查询，queryKey=['models']
 * - useCreateModelMapping: mutation 成功后自动 invalidate 'model-mappings' 缓存触发刷新
 * - useUpdateModelMapping: 同上
 * - useDeleteModelMapping: 同上
 *
 * 缓存策略：所有写操作（CUD）成功后 invalidate 'model-mappings'，下次读取时自动重新 fetch。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { ModelMapping, ModelInfo } from '../../../shared/types'

/** 查询所有模型映射列表。 @returns TanStack Query 结果，data 为 ModelMapping 数组。 */
export function useModelMappings() {
  return useQuery<ModelMapping[]>({
    queryKey: ['model-mappings'],
    queryFn: () => api.models.mapping.list(),
  })
}

/** 查询所有可用模型列表。 @returns TanStack Query 结果，data 为 ModelInfo 数组。 */
export function useModels() {
  return useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => api.models.list(),
  })
}

/** 创建模型映射 mutation，成功后自动刷新列表缓存。 @returns TanStack Mutation 对象。 */
export function useCreateModelMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { sourceModel: string; targetModel: string }) =>
      api.models.mapping.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['model-mappings'] }),
  })
}

/** 更新模型映射 mutation，成功后自动刷新列表缓存。 @returns TanStack Mutation 对象。 */
export function useUpdateModelMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: number; sourceModel?: string; targetModel?: string }) =>
      api.models.mapping.update(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['model-mappings'] }),
  })
}

/** 删除模型映射 mutation，成功后自动刷新列表缓存。 @returns TanStack Mutation 对象。 */
export function useDeleteModelMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.models.mapping.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['model-mappings'] }),
  })
}
