/**
 * Conversation 查询 Hooks
 *
 * 封装的 IPC 通道：conversations.list / conversations.create / conversations.delete
 *
 * TanStack Query 用法：
 * - useConversations: 列表查询，queryKey=['conversations']
 * - useCreateConversation: 支持 providerId 和 apiKeyId 可选关联
 * - useDeleteConversation: 删除后 invalidate 缓存
 *
 * 缓存策略：写操作后 invalidate 'conversations' 列表缓存。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { Conversation } from '@/lib/types'

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
    mutationFn: (id: number) =>
      api.conversations.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}
