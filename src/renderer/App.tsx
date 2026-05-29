import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { ApiKeysPage } from './pages/ApiKeys'
import { LogsPage } from './pages/Logs'
import { ChatPage } from './pages/Chat'
import { SettingsPage } from './pages/Settings'
import { Sonner } from './components/ui/sonner'
import { UpdateDialog } from './components/update/UpdateDialog'
import { useSkipVersion } from './lib/queries/update'
import { toast } from 'sonner'

function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes?: string | null } | null>(null)
  const [currentVersion, setCurrentVersion] = useState('dev')

  const skipVersion = useSkipVersion()

  // 通过 IPC 获取真实版本号
  useEffect(() => {
    const api = window.electronAPI?.update
    if (!api) return

    api.getCurrentVersion().then((v) => setCurrentVersion(v)).catch(() => {})
  }, [])

  useEffect(() => {
    const api = window.electronAPI?.update
    if (!api) return

    const unsubscribeAvailable = api.onAvailable((info) => {
      setUpdateInfo(info)
      setUpdateAvailable(true)
    })

    const unsubscribeProgress = api.onProgress((progress) => {
      const percent = Math.round(progress.percent)
      toast.loading(`正在下载更新... ${percent}%`, { id: 'update-download' })
    })

    const unsubscribeDownloaded = api.onDownloaded(() => {
      toast.dismiss('update-download')
      toast.success('更新下载完成，将自动安装并重启应用')
    })

    const unsubscribeError = api.onError((error) => {
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

  const handleUpdate = async () => {
    try {
      await window.electronAPI?.update?.download()
    } catch {
      toast.error('下载更新失败')
    }
  }

  const handleSkip = async (version: string) => {
    await skipVersion.mutateAsync(version)
  }

  return (
    <>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Sonner />

      <UpdateDialog
        open={updateAvailable}
        onOpenChange={setUpdateAvailable}
        currentVersion={currentVersion}
        newVersion={updateInfo?.version || ''}
        releaseNotes={updateInfo?.releaseNotes}
        onUpdate={handleUpdate}
        onSkip={handleSkip}
      />
    </>
  )
}

export default App
