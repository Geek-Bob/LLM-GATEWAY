import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { Conversation } from '../types'

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => api.conversations.list(),
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      api.conversations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.conversations.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}
