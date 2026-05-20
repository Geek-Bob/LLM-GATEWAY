import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import type { Provider, ProviderStatsGroup, DashboardStats, StatsDataPoint } from '../lib/types'
import { StatsCard } from '../components/StatsCard'
import { HourlyBarChart, DailyAreaChart } from '../components/StatsCharts'
import { motion, AnimatePresence } from 'framer-motion'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function Dashboard() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [dailyStats, setDailyStats] = useState<ProviderStatsGroup[]>([])
  const [hourlyStats, setHourlyStats] = useState<ProviderStatsGroup[]>([])
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null)
  const [proxyPort, setProxyPort] = useState(8080)
  const [proxyRunning, setProxyRunning] = useState(true)
  const [copied, setCopied] = useState(false)

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`http://localhost:${proxyPort}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  useEffect(() => {
    api.proxy.status().then((cfg) => {
      setProxyPort(cfg.port)
      setProxyRunning(cfg.running)
    })
  }, [])

  useEffect(() => {
    api.providers.list().then(setProviders)
    api.logs.stats('7d').then(setStats)
    api.logs.statsDetailed('24h').then(setHourlyStats)
    api.logs.statsDetailed('30d').then(setDailyStats)
  }, [])

  function findHourlyData(providerId: number, model: string): StatsDataPoint[] {
    const p = hourlyStats.find((g) => g.providerId === providerId)
    return p?.models.find((m) => m.model === model)?.dataPoints ?? []
  }

  const statsCards = [
    {
      title: '近 7 日请求',
      value: stats?.total_requests ?? 0,
      icon: '📡',
    },
    {
      title: 'Token 消耗',
      value: stats
        ? (stats.total_tokens_in + stats.total_tokens_out).toLocaleString()
        : '0',
      icon: '🔤',
    },
    {
      title: '供应商标记',
      value: `${providers.filter((p) => p.isActive).length} / ${providers.length}`,
      icon: '🏢',
    },
    {
      title: '平均延迟',
      value: stats ? `${Math.round(stats.avg_duration_ms)}ms` : '0ms',
      icon: '⚡',
    },
  ]

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      <motion.div variants={childVariants} className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>仪表盘</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>系统概览与服务状态</p>
      </motion.div>

      {/* Proxy Control */}
      <motion.div variants={childVariants} className="mb-4">
        <div className="cyber-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${proxyRunning ? 'animate-heartbeat' : ''}`}
              style={{ color: proxyRunning ? '#22c55e' : '#ef4444', background: proxyRunning ? '#22c55e' : '#ef4444' }}
            />
            <span className="text-sm font-medium" style={{ color: '#f1f5f9' }}>代理服务</span>
            {proxyRunning ? (
              <span className="font-mono text-sm" style={{ color: '#64748b' }}>
                localhost:<span style={{ color: '#60a5fa' }}>{proxyPort}</span>
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono" style={{ color: '#475569' }}>localhost:</span>
                <input
                  type="number"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(Number(e.target.value))}
                  min={1024}
                  max={65535}
                  className="cyber-input w-20 text-xs px-2 py-1"
                />
              </div>
            )}
            {/* Copy URL button */}
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all duration-200"
              style={{
                background: copied ? 'rgba(34, 197, 94, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                color: copied ? '#22c55e' : '#64748b',
              }}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={() => {
              if (proxyRunning) {
                api.proxy.stop().catch(() => {})
                setProxyRunning(false)
              } else {
                api.proxy.setPort(proxyPort)
                api.proxy.start(proxyPort).then(setProxyRunning).catch(() => setProxyRunning(false))
              }
            }}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
              proxyRunning ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                proxyRunning ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={childVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {statsCards.map((card) => (
          <StatsCard key={card.title} {...card} />
        ))}
      </motion.div>

      {/* Stats Summary Table */}
      <motion.div variants={childVariants} className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>调用统计</h2>
        </div>
        {dailyStats.length === 0 ? (
          <div className="cyber-card p-6 text-center">
            <p className="text-sm" style={{ color: '#64748b' }}>暂无统计数据，发送请求后自动生成</p>
          </div>
        ) : (
          <div className="cyber-card overflow-hidden">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th>供应商 / 模型</th>
                  <th style={{ textAlign: 'right' }}>调用次数</th>
                  <th style={{ textAlign: 'right' }}>输入 Tokens</th>
                  <th style={{ textAlign: 'right' }}>输出 Tokens</th>
                  <th style={{ textAlign: 'right' }}>错误</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((group) => [
                  <tr key={group.providerId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td><strong style={{ color: '#e6edf3' }}>{group.providerName}</strong></td>
                    <td style={{ textAlign: 'right', color: '#8b949e' }}>
                      {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: '#8b949e' }}>
                      {group.models.reduce((s, m) => s + m.totalTokensIn, 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: '#8b949e' }}>
                      {group.models.reduce((s, m) => s + m.totalTokensOut, 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: group.models.reduce((s, m) => s + m.totalErrors, 0) > 0 ? '#ef4444' : '#8b949e' }}>
                      {group.models.reduce((s, m) => s + m.totalErrors, 0)}
                    </td>
                  </tr>,
                  ...group.models.map((model) => (
                    <tr key={`${group.providerId}-${model.model}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ paddingLeft: 32, color: '#8b949e' }}>└ {model.model}</td>
                      <td style={{ textAlign: 'right', color: '#e6edf3' }}>{model.totalRequests.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e' }}>{model.totalTokensIn.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e' }}>{model.totalTokensOut.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: model.totalErrors > 0 ? '#ef4444' : '#8b949e' }}>{model.totalErrors}</td>
                    </tr>
                  ))
                ])}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Provider Accordion */}
      <motion.div variants={childVariants}>
        <h2 className="text-base font-semibold mb-4" style={{ color: '#f1f5f9' }}>时间趋势</h2>
        {dailyStats.length === 0 ? (
          <div className="cyber-card p-6 text-center">
            <p className="text-sm" style={{ color: '#64748b' }}>暂无统计数据，发送请求后自动生成</p>
          </div>
        ) : (
        <div className="space-y-2">
          {dailyStats.map((group) => (
            <div key={group.providerId} className="cyber-card overflow-hidden">
              <button
                onClick={() => setExpandedProvider(expandedProvider === group.providerId ? null : group.providerId)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
              >
                <span style={{ color: expandedProvider === group.providerId ? '#60a5fa' : '#8b949e', fontSize: 14 }}>
                  {expandedProvider === group.providerId ? '▾' : '▸'}
                </span>
                <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
                <span className="font-medium" style={{ color: '#e6edf3' }}>{group.providerName}</span>
                <span style={{ color: '#8b949e', fontSize: 13 }}>{group.models.length} 个模型</span>
                <span style={{ color: '#8b949e', fontSize: 13 }}>
                  {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()} 次调用
                </span>
                <span style={{ color: '#8b949e', fontSize: 12 }}>
                  | {group.models.reduce((s, m) => s + m.totalTokensIn + m.totalTokensOut, 0).toLocaleString()} tokens
                </span>
              </button>

              <AnimatePresence>
                {expandedProvider === group.providerId && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div style={{ padding: '16px 20px' }}>
                      {group.models.map((model, idx) => (
                        <div
                          key={model.model}
                          style={{
                            borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            paddingTop: idx > 0 ? 16 : 0,
                            marginTop: idx > 0 ? 16 : 0,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                            <span style={{ fontWeight: 500, color: '#e6edf3' }}>{model.model}</span>
                            <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                              {model.totalRequests} 次
                            </span>
                            <span style={{ fontSize: 12, color: '#8b949e' }}>
                              | 输入 {model.totalTokensIn.toLocaleString()} · 输出 {model.totalTokensOut.toLocaleString()} tokens
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div className="cyber-card" style={{ padding: 12 }}>
                              <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                24 小时 · 柱状图
                              </div>
                              <HourlyBarChart data={findHourlyData(group.providerId, model.model)} height={100} />
                            </div>
                            <div className="cyber-card" style={{ padding: 12 }}>
                              <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                30 天 · 面积图
                              </div>
                              <DailyAreaChart data={model.dataPoints} height={100} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        )}
      </motion.div>
    </motion.div>
  )
}
