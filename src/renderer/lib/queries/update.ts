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

export function useUpdateConfig() {
  return useQuery<UpdateConfig>({
    queryKey: ['update-config'],
    queryFn: () => api.update.getConfig(),
  })
}

export function useCurrentVersion() {
  return useQuery<string>({
    queryKey: ['current-version'],
    queryFn: () => api.update.getCurrentVersion(),
  })
}

export function useCheckUpdate() {
  return useMutation<UpdateCheckResult>({
    mutationFn: () => api.update.check(),
  })
}

export function useDownloadUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.update.download(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => api.update.install(),
  })
}

export function useSkipVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (version: string) => api.update.skipVersion(version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

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
