import { Progress } from '@/components/ui/progress'
import { Download, CheckCircle, AlertCircle } from 'lucide-react'

interface DownloadProgressProps {
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  percent?: number
  error?: string
}

/** 更新下载进度组件，展示下载中/完成/失败三种状态。 @returns 下载进度 JSX。 */
export function DownloadProgress({ status, percent = 0, error }: DownloadProgressProps) {
  if (status === 'idle') {
    return null
  }

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      {status === 'downloading' && (
        <>
          <Download className="h-5 w-5 animate-pulse text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">正在下载更新...</p>
            <Progress value={percent} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(percent)}%
            </p>
          </div>
        </>
      )}

      {status === 'downloaded' && (
        <>
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium">下载完成</p>
            <p className="text-xs text-muted-foreground">
              点击"立即安装"重启应用
            </p>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium">下载失败</p>
            <p className="text-xs text-muted-foreground">
              {error || '请检查网络连接后重试'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
