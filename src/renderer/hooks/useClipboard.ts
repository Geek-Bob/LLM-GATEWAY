import { useState, useCallback } from 'react'
import { toast } from 'sonner'

/** copied 状态自动重置为 false 的延迟时间（毫秒） */
const RESET_DELAY_MS = 2000

/**
 * 剪贴板复制 hook — 封装 clipboard write + 2s 自动重置
 *
 * @returns copied 状态和 copy 方法
 *
 * @example
 * const { copied, copy } = useClipboard()
 * // 调用: await copy('要复制的文本')
 * // copied 会在 2 秒后自动重置为 false
 */
export function useClipboard() {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), RESET_DELAY_MS)
    } catch (e) {
      console.error('[Clipboard] write failed', e)
      toast.error('复制失败')
    }
  }, [])

  return { copied, copy }
}
