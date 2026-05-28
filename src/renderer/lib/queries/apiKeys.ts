import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ApiKey } from '../types'

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['apiKeys'],
    queryFn: () => api.apiKeys.list(),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, rateLimit }: { name: string; rateLimit?: number }) =>
      api.apiKeys.create(name, rateLimit),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.apiKeys.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}
