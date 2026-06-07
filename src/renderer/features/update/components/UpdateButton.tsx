import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCheckUpdate } from '@/lib/queries/update'
import { toast } from 'sonner'

interface UpdateButtonProps {
  onUpdateAvailable?: (version: string) => void
}

/** 手动检查更新按钮，点击后触发远程版本检查。 @returns 检查更新按钮 JSX。 */
export function UpdateButton({ onUpdateAvailable }: UpdateButtonProps) {
  const checkUpdate = useCheckUpdate()

  const handleCheck = async () => {
    try {
      const result = await checkUpdate.mutateAsync()
      if (result.available && result.version) {
        onUpdateAvailable?.(result.version)
      } else {
        toast.info('当前已是最新版本')
      }
    } catch {
      toast.error('检查更新失败，请稍后重试')
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
