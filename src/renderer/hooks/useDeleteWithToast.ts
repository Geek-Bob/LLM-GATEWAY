import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/utils'

/**
 * 通用删除操作 hook — 封装 try/catch/toast 三件套
 *
 * @param deleteMutation TanStack Query 的 delete mutation
 * @param entityName 实体名称（用于 toast 消息）
 * @returns execute 方法，接收 id 和 displayName
 *
 * @example
 * const deleteMutation = useDeleteApiKey()
 * const { execute: handleDelete } = useDeleteWithToast(deleteMutation, 'API Key')
 * // 调用: handleDelete(key.id, key.name)
 */
export function useDeleteWithToast(
  deleteMutation: { mutateAsync: (id: number) => Promise<void> },
  entityName: string
) {
  const execute = async (id: number, displayName: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      toast.success(`${entityName}「${displayName}」已删除`)
    } catch (e) {
      toast.error(`删除失败: ${getErrorMessage(e)}`)
    }
  }

  return { execute }
}
