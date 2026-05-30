import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../shared/lib/api-client'
import type { Provider } from '../types'

export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => apiFetch('/v1/admin/providers').then(r => r.json()),
  })
}

export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) =>
      apiFetch('/v1/admin/providers', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/v1/admin/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useDeleteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/v1/admin/providers/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}
