import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ProxyStatus } from '../types'

export function useProxyStatus() {
  return useQuery<ProxyStatus>({
    queryKey: ['proxy', 'status'],
    queryFn: () => api.proxy.status(),
  })
}

export function useToggleProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ running, port }: { running: boolean; port: number }) => {
      if (running) {
        await api.proxy.stop()
      } else {
        await api.proxy.setPort(port)
        await api.proxy.start(port)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'status'] }),
  })
}

export function useDebugMode() {
  return useQuery<boolean>({
    queryKey: ['proxy', 'debugMode'],
    queryFn: () => api.proxy.getDebugMode(),
  })
}

export function useSetDebugMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api.proxy.setDebugMode(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'debugMode'] }),
  })
}
