/**
 * 自动更新生命周期管理 Hook
 *
 * 封装主进程推送的更新事件监听（onAvailable / onProgress / onDownloaded / onError），
 * 以及下载、跳过等操作。App.tsx 通过此 hook 获取更新状态并传递给 UpdateDialog。
 *
 * 更新流程：onAvailable → 用户确认 → download → onProgress → onDownloaded → install
 */
import { useEffect, useState } from 'react'

/** 更新下载完成后延迟安装的时间（毫秒），等待 toast 提示展示 */
const INSTALL_DELAY_MS = 1000
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useSkipVersion } from '@/lib/queries/update'

/** useUpdateCheck hook 返回值 */
export interface UpdateCheckState {
  /** 是否有可用更新（控制 UpdateDialog 显隐） */
  isUpdateAvailable: boolean
  /** 更新信息（版本号、releaseNotes） */
  updateInfo: { version: string; releaseNotes?: string | null } | null
  /** 当前应用版本号 */
  currentVersion: string
  /** 设置更新弹窗显隐 */
  setUpdateAvailable: (open: boolean) => void
  /** 触发下载更新 */
  handleDownload: () => Promise<void>
  /** 跳过指定版本 */
  handleSkip: (version: string) => Promise<void>
}

/**
 * 自动更新生命周期管理
 *
 * 职责：
 * 1. 通过 IPC 获取当前应用版本号
 * 2. 监听主进程推送的更新事件（available / progress / downloaded / error）
 * 3. 提供下载、跳过等操作方法
 *
 * @returns 更新状态和操作方法，供 UpdateDialog 使用
 */
export function useUpdateCheck(): UpdateCheckState {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes?: string | null } | null>(null)
  const [currentVersion, setCurrentVersion] = useState('dev')

  const skipVersion = useSkipVersion()

  // 通过 IPC 从主进程获取 Electron 应用的 package.json 版本号
  useEffect(() => {
    if (!api) return

    api.update.getCurrentVersion().then((v) => setCurrentVersion(v)).catch((e) => console.error('[UpdateCheck] Version check failed', e))
  }, [])

  // 注册主进程推送的更新事件监听
  // onAvailable / onProgress / onDownloaded / onError 分别对应 auto-updater 的生命周期事件
  // 每个 on* 返回取消订阅函数，在组件卸载时清理，防止内存泄漏
  useEffect(() => {
    if (!api) return

    const unsubscribeAvailable = api.update.onAvailable((info) => {
      setUpdateInfo(info)
      setIsUpdateAvailable(true)
    })

    const unsubscribeProgress = api.update.onProgress((progress) => {
      const percent = Math.round(progress.percent)
      toast.loading(`正在下载更新... ${percent}%`, { id: 'update-download' })
    })

    const unsubscribeDownloaded = api.update.onDownloaded(() => {
      toast.dismiss('update-download')
      toast.success('更新下载完成，正在安装...')
      // 自动安装更新
      setTimeout(() => {
        api?.update?.install()
      }, INSTALL_DELAY_MS)
    })

    const unsubscribeError = api.update.onError((error) => {
      toast.dismiss('update-download')
      toast.error(`更新失败: ${error.message}`)
    })

    return () => {
      unsubscribeAvailable()
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [])

  const handleDownload = async () => {
    try {
      await api?.update?.download()
    } catch {
      toast.error('下载更新失败')
    }
  }

  const handleSkip = async (version: string) => {
    await skipVersion.mutateAsync(version)
  }

  return {
    isUpdateAvailable,
    updateInfo,
    currentVersion,
    setUpdateAvailable: setIsUpdateAvailable,
    handleDownload,
    handleSkip,
  }
}
