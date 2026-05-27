import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import type { ProxyStatus } from '../lib/types'
import { motion } from 'framer-motion'

export function StatusBar() {
  const [status, setStatus] = useState<ProxyStatus | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.proxy.status().then(setStatus)
  }, [])

  const handleCopy = async () => {
    if (!status) return
    try {
      await navigator.clipboard.writeText(status.url ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  if (!status) {
    return (
      <div className="cyber-card p-5 mb-6">
        <div className="skeleton h-5 w-44" />
      </div>
    )
  }

  return (
    <motion.div
      className="cyber-card p-5 mb-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className={`w-3 h-3 rounded-full ${status.running ? 'animate-pulse-cyan' : ''}`}
            style={{ background: status.running ? '#60a5fa' : '#ef4444' }}
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
              {status.running ? '代理服务运行中' : '代理服务未运行'}
            </p>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#64748b' }}>{status.url || '-'}</p>
          </div>
        </div>
        {status.url && (
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200"
          style={{
            background: copied ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            color: copied ? '#22c55e' : '#60a5fa',
          }}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.18)'
          }}
          onMouseLeave={(e) => {
            if (!copied) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
          }}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              已复制
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制
            </>
          )}
        </button>
        )}
      </div>
    </motion.div>
  )
}
