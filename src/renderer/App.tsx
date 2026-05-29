import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { ApiKeysPage } from './pages/ApiKeys'
import { LogsPage } from './pages/Logs'
import { ChatPage } from './pages/Chat'
import { Sonner } from './components/ui/sonner'
import { Button } from './components/ui/button'
import { UpdateDialog } from './components/update/UpdateDialog'
import { DownloadProgress } from './components/update/DownloadProgress'
import { useSkipVersion } from './lib/queries/update'
import { toast } from 'sonner'

function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes?: string | null } | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadError, setDownloadError] = useState<string>()

  const skipVersion = useSkipVersion()

  useEffect(() => {
    const api = window.electronAPI?.update
    if (!api) return

    const unsubscribeAvailable = api.onAvailable((info) => {
      setUpdateInfo(info)
      setUpdateAvailable(true)
    })

    const unsubscribeProgress = api.onProgress((progress) => {
      setDownloadStatus('downloading')
      setDownloadPercent(progress.percent)
    })

    const unsubscribeDownloaded = api.onDownloaded(() => {
      setDownloadStatus('downloaded')
      toast.success('更新下载完成，点击安装重启应用')
    })

    const unsubscribeError = api.onError((error) => {
      setDownloadStatus('error')
      setDownloadError(error.message)
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

  const handleInstall = async () => {
    try {
      await window.electronAPI?.update?.install()
    } catch {
      toast.error('安装更新失败')
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
          </Route>
        </Routes>
      </HashRouter>
      <Sonner />

      <UpdateDialog
        open={updateAvailable}
        onOpenChange={setUpdateAvailable}
        currentVersion={window.electronAPI ? '1.0.0' : 'dev'}
        newVersion={updateInfo?.version || ''}
        releaseNotes={updateInfo?.releaseNotes}
        onUpdate={handleUpdate}
        onSkip={handleSkip}
      />

      {downloadStatus !== 'idle' && (
        <div className="fixed bottom-4 right-4 z-50">
          <DownloadProgress
            status={downloadStatus}
            percent={downloadPercent}
            error={downloadError}
          />
          {downloadStatus === 'downloaded' && (
            <Button onClick={handleInstall} className="mt-2 w-full">
              立即安装
            </Button>
          )}
        </div>
      )}
    </>
  )
}

export default App
