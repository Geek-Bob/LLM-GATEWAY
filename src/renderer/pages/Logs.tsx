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

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: '#94a3b8' }}>{title}</h4>
      <div className="rounded-lg p-3 space-y-1.5 text-sm" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
        {children}
      </div>
    </div>
  )
}

function DebugKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: '#475569', minWidth: '80px', flexShrink: 0 }}>{label}:</span>
      <span className={mono ? 'font-mono' : ''} style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function DebugJSON({ label, json }: { label: string; json: string }) {
  let formatted = json
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2)
  } catch { /* use raw string */ }

  return (
    <div className="mt-1">
      <span style={{ color: '#475569', fontSize: '13px' }}>{label}:</span>
      <pre
        className="mt-1 p-2.5 rounded text-xs overflow-x-auto max-h-72 overflow-y-auto font-mono"
        style={{ background: 'rgba(2, 6, 23, 0.8)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.08)' }}
      >
        {formatted}
      </pre>
    </div>
  )
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [debugMode, setDebugMode] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchLogs = (pageNum: number) => {
    setLoading(true)
    setSelectedLog(null)
    api.logs.query({ page: pageNum, limit: PAGE_SIZE })
      .then((result) => { setLogs(result.logs); setTotal(result.total) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLogs(page) }, [page])

  useEffect(() => {
    api.proxy.getDebugMode().then(setDebugMode).catch(() => {})
  }, [])

  const goToPrev = () => { if (page > 1) setPage((p) => p - 1) }
  const goToNext = () => { if (page < totalPages) setPage((p) => p + 1) }

  const toggleDebugMode = () => {
    const next = !debugMode
    setDebugMode(next)
    api.proxy.setDebugMode(next).catch(() => {})
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>请求日志</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>查看所有代理请求记录</p>
        </div>
        <button
          onClick={toggleDebugMode}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
          style={{
            background: debugMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(100, 116, 139, 0.12)',
            color: debugMode ? '#22c55e' : '#64748b',
            border: `1px solid ${debugMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`
          }}
        >
          Debug {debugMode ? 'ON' : 'OFF'}
        </button>
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
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02, duration: 0.25 }}
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelectedLog(selectedLog?.id === entry.id ? null : entry)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLog(selectedLog?.id === entry.id ? null : entry) } }}
                      style={{ cursor: 'pointer' }}
                      className={selectedLog?.id === entry.id ? 'bg-white/5' : ''}
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

      {selectedLog && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed right-0 top-12 bottom-0 w-[42%] overflow-y-auto z-30 border-l"
          style={{ borderColor: 'rgba(148, 163, 184, 0.12)', background: '#0b1120' }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between mb-5 sticky top-0 py-3 px-5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)', background: '#0b1120', zIndex: 1 }}>
            <h3 className="text-lg font-bold" style={{ color: '#f1f5f9' }}>
              请求详情 #{selectedLog.id}
            </h3>
            <button
              onClick={() => setSelectedLog(null)}
              className="text-xl leading-none px-2 py-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: '#64748b' }}
            >
              ✕
            </button>
          </div>

          <div className="px-5 pb-5 space-y-5">
            {selectedLog.debug ? (
              <>
                {/* Client request section */}
                <DebugSection title="客户端请求">
                  <DebugKV label="模型" value={selectedLog.model} />
                  <DebugKV label="格式" value={selectedLog.debug.client.apiFormat} />
                  <DebugJSON label="请求体" json={selectedLog.debug.client.body} />
                </DebugSection>

                {/* Route & conversion section */}
                <DebugSection title="路由 & 转换">
                  <DebugKV label="Provider" value={`${selectedLog.debug.route.providerName} (${selectedLog.debug.route.providerType})`} />
                  <DebugKV label="Base URL" value={selectedLog.debug.route.baseUrl} />
                  <DebugKV label="上游模型" value={selectedLog.debug.route.modelName} />
                  {selectedLog.debug.conversion && (
                    <>
                      <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />
                      <DebugKV label="协议转换" value={`${selectedLog.debug.conversion.from} → ${selectedLog.debug.conversion.to}`} />
                      <DebugKV label="原始路径" value={selectedLog.debug.conversion.originalPath} />
                      <DebugKV label="转换路径" value={selectedLog.debug.conversion.convertedPath} />
                      <DebugKV label="原始模型" value={selectedLog.debug.conversion.originalModel} />
                      <DebugKV label="转换模型" value={selectedLog.debug.conversion.convertedModel} />
                    </>
                  )}
                </DebugSection>

                {/* Upstream request section */}
                <DebugSection title="上游请求">
                  <DebugKV label="URL" value={selectedLog.debug.upstream.url} />
                  <DebugKV label="状态码" value={String(selectedLog.debug.upstream.statusCode)} mono />
                  <DebugJSON label="请求体" json={selectedLog.debug.upstream.body} />
                </DebugSection>

                {/* Upstream response section */}
                <DebugSection title="上游响应">
                  <DebugJSON label="响应体" json={selectedLog.debug.upstream.responseBody} />
                </DebugSection>
              </>
            ) : (
              /* No debug data — show basic info + hint */
              <div className="text-center py-12">
                <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>基础信息</p>
                <div className="space-y-2 text-left max-w-xs mx-auto">
                  <DebugKV label="状态码" value={String(selectedLog.status_code)} />
                  <DebugKV label="耗时" value={`${selectedLog.duration_ms}ms`} />
                  <DebugKV label="Tokens" value={`${selectedLog.tokens_in}↑ ${selectedLog.tokens_out}↓`} />
                  {selectedLog.error && <DebugKV label="错误" value={selectedLog.error} />}
                </div>
                <div className="mt-8 p-4 rounded-lg mx-auto max-w-xs" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                  <p className="text-sm" style={{ color: '#93c5fd' }}>
                    开启 <strong>Debug 模式</strong> 后可查看完整请求/响应体
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
