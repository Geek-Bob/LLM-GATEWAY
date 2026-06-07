/**
 * 自动更新查询 Hooks
 *
 * 封装的 IPC 通道：
 * - update.getConfig / update.setConfig — 更新配置（自动/手动检查、渠道等）
 * - update.getCurrentVersion — 当前应用版本
 * - update.check — 手动触发远程版本检查
 * - update.download — 下载新版本
 * - update.install — 安装已下载的更新
 * - update.skipVersion — 跳过指定版本
 *
 * 更新工作流：check → download → install
 * - useCheckUpdate: 纯 mutation，不缓存结果，每次调用触发远程检查
 * - useDownloadUpdate: 下载成功时 invalidate 'update-config'（版本状态可能变化）
 * - useSkipVersion: 跳过后 invalidate 'update-config'
 * - useUpdateConfigMutation: 修改配置后 invalidate，支持外部 onError 回调
 *
 * useCurrentVersion / useUpdateConfig: 只读查询，有 TanStack Query 缓存
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { UpdateCheckResult, UpdateConfig } from '../../../shared/types'

/** 查询当前更新配置（自动检查、预发布版本等）。 @returns TanStack Query 结果，data 为 UpdateConfig。 */
export function useUpdateConfig() {
  return useQuery<UpdateConfig>({
    queryKey: ['update-config'],
    queryFn: () => api.update.getConfig(),
  })
}

/** 查询当前应用版本号。 @returns TanStack Query 结果，data 为版本字符串。 */
export function useCurrentVersion() {
  return useQuery<string>({
    queryKey: ['current-version'],
    queryFn: () => api.update.getCurrentVersion(),
  })
}

/** 手动触发远程版本检查 mutation。 @returns TanStack Mutation 对象。 */
export function useCheckUpdate() {
  return useMutation<UpdateCheckResult>({
    mutationFn: () => api.update.check(),
  })
}

/** 下载更新 mutation，成功后自动刷新更新配置缓存。 @returns TanStack Mutation 对象。 */
export function useDownloadUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.update.download(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

/** 安装已下载更新 mutation。 @returns TanStack Mutation 对象。 */
export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => api.update.install(),
  })
}

/** 跳过指定版本 mutation，成功后自动刷新更新配置缓存。 @returns TanStack Mutation 对象。 */
export function useSkipVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (version: string) => api.update.skipVersion(version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

/** 修改更新配置 mutation，支持外部 onError 回调。 @param options - 可选配置，包含 onError 回调。 @returns TanStack Mutation 对象。 */
export function useUpdateConfigMutation(
  options?: Partial<{ onError: (error: Error) => void }>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Partial<UpdateConfig>) => api.update.setConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
    onError: options?.onError,
  })
}
