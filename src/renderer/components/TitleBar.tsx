import { api } from '../lib/ipc'

export function TitleBar() {
  const handleMinimize = () => api.window.minimize()
  const handleMaximize = () => api.window.maximize()
  const handleClose = () => api.window.close()

  return (
    <div
      className="drag flex items-center justify-between h-11 px-4 select-none shrink-0"
      style={{ background: '#0a0c12', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#60a5fa' }} />
          <span className="text-sm font-bold tracking-tight" style={{ color: '#f1f5f9' }}>LLM Gateway</span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' }}>
          v1.0
        </span>
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          aria-label="最小化"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          aria-label="最大化"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8v8m16-8v8" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)'; e.currentTarget.style.color = '#f43f5e' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          aria-label="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
