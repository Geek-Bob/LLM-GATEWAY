import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../shared/lib/api-client'
import type { Conversation } from '../types'

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => apiFetch('/v1/admin/conversations').then(r => r.json()),
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      apiFetch('/v1/admin/conversations', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/v1/admin/conversations/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}
