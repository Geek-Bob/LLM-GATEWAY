import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/ipc'
import type { LogEntry } from '../lib/types'

const PAGE_SIZE = 10

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatTokens(entry: LogEntry) {
  if (entry.tokens_in === 0 && entry.tokens_out === 0) return '-'
  return `${entry.tokens_in}↑ ${entry.tokens_out}↓`
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchLogs = (pageNum: number) => {
    setLoading(true)
    api.logs.query({ page: pageNum, limit: PAGE_SIZE })
      .then((result) => { setLogs(result.logs); setTotal(result.total) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLogs(page) }, [page])

  const goToPrev = () => { if (page > 1) setPage((p) => p - 1) }
  const goToNext = () => { if (page < totalPages) setPage((p) => p + 1) }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>请求日志</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>查看所有代理请求记录</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="cyber-card p-8">
          <div className="space-y-4">
            {[1,2,3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="cyber-card p-12 text-center">
          <div className="text-3xl mb-3 opacity-40">📋</div>
          <p className="text-base font-medium" style={{ color: '#94a3b8' }}>暂无日志</p>
        </div>
      ) : (
        <>
          <div className="cyber-card overflow-hidden">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模型</th>
                  <th>格式</th>
                  <th>状态</th>
                  <th>延迟</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, idx) => {
                  const isSuccess = entry.status_code < 400
                  return (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02, duration: 0.25 }}
                    >
                      <td>
                        <span className="text-sm whitespace-nowrap" style={{ color: '#64748b' }}>{formatDate(entry.created_at)}</span>
                      </td>
                      <td>
                        <span className="font-medium" style={{ color: '#f1f5f9' }}>{entry.model}</span>
                      </td>
                      <td>
                        <span
                          className="cyber-badge"
                          style={{
                            background: entry.api_format === 'openai' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                            color: entry.api_format === 'openai' ? '#22c55e' : '#60a5fa',
                          }}
                        >
                          {entry.api_format}
                        </span>
                      </td>
                      <td>
                        <span
                          className="cyber-badge"
                          style={{
                            background: isSuccess ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                            color: isSuccess ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {entry.status_code}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-sm" style={{ color: '#94a3b8' }}>{entry.duration_ms}ms</span>
                      </td>
                      <td>
                        <span className="font-mono text-sm tabular-nums" style={{ color: '#94a3b8' }}>
                          {formatTokens(entry)}
                        </span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="text-sm" style={{ color: '#475569' }}>共 {total} 条</span>
            <div className="flex items-center gap-3">
              <button
                onClick={goToPrev}
                disabled={page <= 1}
                className="btn-ghost text-xs !px-3 !py-1.5 disabled:opacity-30"
              >
                上一页
              </button>
              <span className="text-sm tabular-nums" style={{ color: '#64748b' }}>{page} / {totalPages}</span>
              <button
                onClick={goToNext}
                disabled={page >= totalPages}
                className="btn-ghost text-xs !px-3 !py-1.5 disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
