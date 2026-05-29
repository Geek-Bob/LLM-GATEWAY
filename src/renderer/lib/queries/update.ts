import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
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
