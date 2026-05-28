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
    mutationFn: (id: number) => api.providers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}
