import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/utils'

/**
 * 保存操作 hook — 封装 setSaving + try/finally 逻辑
 *
 * @returns saving 状态和 execute 方法
 *
 * @example
 * const { saving, execute } = useSavingAction()
 * const handleSave = () => execute(async () => {
 *   await createMutation.mutateAsync(data)
 *   toast.success('创建成功')
 * }, '创建失败')
 */
export function useSavingAction() {
  const [saving, setSaving] = useState(false)

  const execute = useCallback(async (
    fn: () => Promise<void>,
    errorPrefix = '操作失败'
  ) => {
    setSaving(true)
    try {
      await fn()
    } catch (e) {
      toast.error(`${errorPrefix}: ${getErrorMessage(e)}`)
    } finally {
      setSaving(false)
    }
  }, [])

  return { saving, execute }
}
