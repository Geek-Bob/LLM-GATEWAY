import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

/**
 * 渲染进程入口
 *
 * 初始化 TanStack Query 客户端，挂载 React 根组件。
 * QueryClient 配置说明：
 * - staleTime: 1s — 数据快速过期，确保页面间切换时获取最新数据
 * - refetchOnWindowFocus: false — Electron 桌面应用不需要焦点重新请求
 * - retry: 0 — 失败不重试，失败状态直接交给 UI 处理（IPC 请求失败通常是确定性的）
 */

// 全局启用 dark 主题（Radix Portal 组件需要在 html 级别生效）
document.documentElement.classList.add('dark')

/**
 * QueryClient 单例
 * staleTime 设为 1 秒——页面间切换时快速刷新，同时避免同一渲染周期内重复请求。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1_000,
      refetchOnWindowFocus: false,
      retry: 0,
    },
    mutations: {
      retry: 0,
    },
  },
})

// 开发辅助：将 TanStack Query 的错误统一打印到控制台，便于调试
if (typeof window !== 'undefined') {
  const origError = console.error.bind(console)
  queryClient.getQueryCache().subscribe((event: any) => {
    if (event.query?.state?.status === 'error') {
      origError(`[Query Error] ${event.query.queryKey.join('/')}:`, event.query.state.error)
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
