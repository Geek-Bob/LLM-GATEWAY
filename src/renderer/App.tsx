import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/ipc'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
// 路由级代码分割：每个页面独立 chunk，按需加载
// 页面使用命名导出（export function），需要 .then(m => m.Xxx) 提取
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const ProvidersPage = lazy(() => import('@/pages/Providers').then(m => ({ default: m.ProvidersPage })))
const ApiKeysPage = lazy(() => import('@/pages/ApiKeys').then(m => ({ default: m.ApiKeysPage })))
const LogsPage = lazy(() => import('@/pages/Logs').then(m => ({ default: m.LogsPage })))
const ChatPage = lazy(() => import('@/pages/Chat').then(m => ({ default: m.ChatPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsPage })))
const ModelMappingsPage = lazy(() => import('@/pages/ModelMappings').then(m => ({ default: m.ModelMappingsPage })))
const AgentsPage = lazy(() => import('@/pages/Agents').then(m => ({ default: m.AgentsPage })))
import { Sonner } from '@/components/ui/sonner'
import { UpdateDialog } from '@/features/update/components/UpdateDialog'

/** 路由切换时的轻量 fallback，避免引入额外依赖 */
function PageLoading() {
  return <div className="flex items-center justify-center h-full text-muted-foreground p-6">加载中...</div>
}

/**
 * 应用根组件
 *
 * 职责：
 * 1. 后端就绪检测 — 监听主进程 backend:ready 事件，未就绪时展示启动 loading
 * 2. HashRouter 路由分发 — Electron 必须用 HashRouter（文件协议不支持 BrowserRouter）
 * 3. 自动更新生命周期 — 委托 useUpdateCheck hook 管理，控制 UpdateDialog 昸隐
 * 4. 布局容器 Layout 包裹所有页面，统一导航栏
 *
 * 路由结构：
 *   / → Dashboard（仪表盘）
 *   /providers → 供应商管理
 *   /api-keys → API Key 管理
 *   /logs → 日志查询
 *   /chat → AI 聊天（走 HTTP 代理）
 *   /model-mappings → 模型映射
 *   /agents → Agent 配置
 *   /settings → 设置
 *
 * 更新流程：
 *   useUpdateCheck hook → onAvailable → 展示 UpdateDialog → 用户确认 → download → install
 */
function App() {
  const [backendReady, setBackendReady] = useState(false)
  const {
    isUpdateAvailable,
    updateInfo,
    currentVersion,
    setUpdateAvailable: setIsUpdateAvailable,
    handleDownload,
    handleSkip,
  } = useUpdateCheck()

  // 监听主进程推送的 backend:ready 事件 + 主动查询（解决时序竞态）
  useEffect(() => {
    if (!api) {
      // 非 Electron 环境（浏览器调试等）：直接标记为就绪
      setBackendReady(true)
      return
    }
    // 先注册事件监听（后续 ready 事件走这条路）
    const unsubscribe = api.backend.onReady(() => setBackendReady(true))
    // 再主动查询一次（防止事件在监听器注册前就已发出）
    api.backend.isReady().then((ready) => {
      if (ready) setBackendReady(true)
    }).catch((e) => console.error('Backend ready check failed', e))
    return unsubscribe
  }, [])

  // 后端未就绪时显示启动 loading 界面，避免空白等待
  if (!backendReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400 select-none">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-3">LLM Gateway</div>
          <div className="animate-pulse">正在初始化服务...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <HashRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="providers" element={<ProvidersPage />} />
              <Route path="api-keys" element={<ApiKeysPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="model-mappings" element={<ModelMappingsPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
      <Sonner />

      <UpdateDialog
        open={isUpdateAvailable}
        onOpenChange={setIsUpdateAvailable}
        currentVersion={currentVersion}
        newVersion={updateInfo?.version || ''}
        releaseNotes={updateInfo?.releaseNotes}
        onUpdate={handleDownload}
        onSkip={handleSkip}
      />
    </>
  )
}

export default App
