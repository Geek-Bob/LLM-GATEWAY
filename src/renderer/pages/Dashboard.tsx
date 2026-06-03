/**
 * Dashboard 页面 — 系统概览与服务状态
 *
 * 数据流:
 * 1. useProviders / useDashboardStats / useHourlyStats / useDailyStats 通过 IPC 获取数据
 * 2. useProxyStatus / useToggleProxy 控制 HTTP 代理服务的启停
 * 3. 顶部显示代理开关及 4 个统计卡片（请求数、Token、供应商、延迟）
 * 4. 中部表格展示各供应商/模型的调用汇总（逐日统计）
 * 5. 底部手风琴展示单个模型 24h 柱状图和 30 天面积图
 */

import { useState } from 'react'
import { useProviders } from '../lib/queries/providers'
import { useDashboardStats, useHourlyStats, useDailyStats } from '../lib/queries/stats'
import { useProxyStatus, useToggleProxy } from '../lib/queries/proxy'
import type { StatsDataPoint } from '../lib/types'
import { StatsCard } from '../components/StatsCard'
import { HourlyBarChart, DailyAreaChart } from '../components/StatsCharts'
import { Card, CardContent } from '../components/ui/card'
import { Switch } from '../components/ui/switch'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, Coins, Building2, Zap, Copy, Check, ChevronRight } from 'lucide-react'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function Dashboard() {
  const { data: providers, isLoading: providersLoading } = useProviders()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: hourlyStats } = useHourlyStats()
  const { data: dailyStats, isLoading: dailyLoading } = useDailyStats()
  const { data: proxyStatus } = useProxyStatus()
  const toggleProxy = useToggleProxy()

  const [expandedProvider, setExpandedProvider] = useState<number | null>(null)
  const [proxyPort, setProxyPort] = useState(8080)
  const [copied, setCopied] = useState(false)

  const proxyRunning = proxyStatus?.running ?? false
  const port = proxyStatus?.port ?? proxyPort

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`http://localhost:${port}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleToggleProxy = () => {
    toggleProxy.mutate({ running: proxyRunning, port: proxyRunning ? port : proxyPort })
  }

  function findHourlyData(providerId: number, model: string): StatsDataPoint[] {
    const p = hourlyStats?.find((g) => g.providerId === providerId)
    return p?.models.find((m) => m.model === model)?.dataPoints ?? []
  }

  const activeProviders = providers?.filter((p) => p.isActive).length ?? 0
  const totalProviders = providers?.length ?? 0

  const statsCards = [
    {
      title: '近 7 日请求',
      value: stats?.total_requests ?? 0,
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      title: 'Token 消耗',
      value: stats
        ? (stats.total_tokens_in + stats.total_tokens_out).toLocaleString()
        : '0',
      icon: <Coins className="w-5 h-5" />,
    },
    {
      title: '供应商标记',
      value: `${activeProviders} / ${totalProviders}`,
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      title: '平均延迟',
      value: stats ? `${Math.round(stats.avg_duration_ms)}ms` : '0ms',
      icon: <Zap className="w-5 h-5" />,
    },
  ]

  if (providersLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={childVariants} className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">仪表盘</h1>
        <p className="text-sm mt-1 text-muted-foreground">系统概览与服务状态</p>
      </motion.div>

      {/* Proxy Control */}
      <motion.div variants={childVariants} className="mb-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  proxyRunning ? 'bg-green-500 animate-heartbeat' : 'bg-red-500'
                }`}
              />
              <span className="text-sm font-medium text-foreground">代理服务</span>
              {proxyRunning ? (
                <span className="font-mono text-sm text-muted-foreground">
                  localhost:<span className="text-primary">{port}</span>
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-muted-foreground">localhost:</span>
                  <Input
                    type="number"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(Math.max(1024, Math.min(65535, Number(e.target.value) || 8080)))}
                    min={1024}
                    max={65535}
                    className="w-20 text-xs h-7"
                  />
                </div>
              )}
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all duration-200 bg-muted/50 hover:bg-muted text-muted-foreground"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <Switch
              checked={proxyRunning}
              onCheckedChange={handleToggleProxy}
            />
          </CardContent>
        </Card>
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
          <h2 className="text-base font-semibold text-foreground">调用统计</h2>
        </div>
        {dailyLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !dailyStats || dailyStats.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">暂无统计数据，发送请求后自动生成</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商 / 模型</TableHead>
                  <TableHead className="text-right">调用次数</TableHead>
                  <TableHead className="text-right">输入 Tokens</TableHead>
                  <TableHead className="text-right">输出 Tokens</TableHead>
                  <TableHead className="text-right">错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyStats.map((group) => [
                  <TableRow key={group.providerId}>
                    <TableCell className="font-medium text-foreground">{group.providerName}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {group.models.reduce((s, m) => s + m.totalTokensIn, 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {group.models.reduce((s, m) => s + m.totalTokensOut, 0).toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right ${group.models.reduce((s, m) => s + m.totalErrors, 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {group.models.reduce((s, m) => s + m.totalErrors, 0)}
                    </TableCell>
                  </TableRow>,
                  ...group.models.map((model) => (
                    <TableRow key={`${group.providerId}-${model.model}`}>
                      <TableCell className="pl-8 text-muted-foreground">└ {model.model}</TableCell>
                      <TableCell className="text-right text-foreground">{model.totalRequests.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{model.totalTokensIn.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{model.totalTokensOut.toLocaleString()}</TableCell>
                      <TableCell className={`text-right ${model.totalErrors > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{model.totalErrors}</TableCell>
                    </TableRow>
                  ))
                ])}
              </TableBody>
            </Table>
          </Card>
        )}
      </motion.div>

      {/* Provider Accordion */}
      <motion.div variants={childVariants}>
        <h2 className="text-base font-semibold mb-4 text-foreground">时间趋势</h2>
        {dailyLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !dailyStats || dailyStats.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">暂无统计数据，发送请求后自动生成</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {dailyStats.map((group) => (
              <Card key={group.providerId} className="border-border/50 overflow-hidden">
                <button
                  onClick={() => setExpandedProvider(expandedProvider === group.providerId ? null : group.providerId)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight
                    className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                      expandedProvider === group.providerId ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-medium text-foreground">{group.providerName}</span>
                  <Badge variant="secondary" className="text-xs">{group.models.length} 个模型</Badge>
                  <span className="text-muted-foreground text-sm">
                    {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()} 次调用
                  </span>
                  <span className="text-muted-foreground text-xs">
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
                      className="border-t border-border/50"
                    >
                      <div className="p-5">
                        {group.models.map((model, idx) => (
                          <div
                            key={model.model}
                            className={idx > 0 ? 'border-t border-border/50 pt-4 mt-4' : ''}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <span className="font-medium text-foreground">{model.model}</span>
                              <Badge variant="outline" className="text-xs">
                                {model.totalRequests} 次
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                | 输入 {model.totalTokensIn.toLocaleString()} · 输出 {model.totalTokensOut.toLocaleString()} tokens
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Card className="border-border/50 p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                  24 小时 · 柱状图
                                </div>
                                <HourlyBarChart data={findHourlyData(group.providerId, model.model)} height={100} />
                              </Card>
                              <Card className="border-border/50 p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                  30 天 · 面积图
                                </div>
                                <DailyAreaChart data={model.dataPoints} height={100} />
                              </Card>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
