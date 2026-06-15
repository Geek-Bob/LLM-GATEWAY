import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCheckUpdate } from '@/lib/queries/update'
import { toast } from 'sonner'
import type { UpdateCheckResult } from '../../../../shared/types'

interface UpdateButtonProps {
  onUpdateAvailable?: (version: string) => void
}

/** 手动检查更新按钮，点击后触发远程版本检查。 @returns 检查更新按钮 JSX。 */
export function UpdateButton({ onUpdateAvailable }: UpdateButtonProps) {
  const checkUpdate = useCheckUpdate()

  const handleCheck = async (): Promise<void> => {
    try {
      const result: UpdateCheckResult = await checkUpdate.mutateAsync()
      // 优先识别 error：网络失败、上游不可达等
      if (result.error) {
        toast.error(`检查更新失败：${result.error}`)
        return
      }
      if (result.isAvailable && result.version) {
        onUpdateAvailable?.(result.version)
      } else {
        toast.info('当前已是最新版本')
      }
    } catch (e) {
      toast.error(`检查更新失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheck}
      disabled={checkUpdate.isPending}
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${checkUpdate.isPending ? 'animate-spin' : ''}`} />
      {checkUpdate.isPending ? '检查中...' : '检查更新'}
    </Button>
  )
}
