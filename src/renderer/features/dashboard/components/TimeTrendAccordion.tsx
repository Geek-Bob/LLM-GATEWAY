/**
 * TimeTrendAccordion — 时间趋势手风琴（Tab + 3 趋势图）
 *
 * 顶部 [24h] [30d] Tab 切换数据源（useHourlyStats/useDailyStats 均预加载，Tab 仅切换显示）；
 * 手风琴按供应商→模型展开，每个模型下渲染 3 张趋势图：
 *   1. Token 趋势（TrendLineChart）：总输入/缓存/非缓存 3 线
 *   2. 花费趋势（TrendLineChart）：缓存/非缓存/输出 3 线
 *   3. 次数趋势（TrendBarChart）：requests 柱状
 * 非缓存 token 前端实时算（tokensIn - cacheTokens，clamp≥0），与 RangeSummary 口径一致。
 * Tab 切换时手风琴展开态（按 providerId 记忆）保留。
 *
 * 设计文档：docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#3-前端布局与组件
 */

import { useState } from 'react'
import type { ProviderStatsGroup, StatsDataPoint } from '@/lib/types'
import { TrendLineChart } from '@/features/dashboard/components/TrendLineChart'
import { TrendBarChart } from '@/features/dashboard/components/TrendBarChart'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

/** Tab 类型：24 小时或 30 天 */
type TrendTab = '24h' | '30d'

interface TimeTrendAccordionProps {
  dailyStats: ProviderStatsGroup[] | undefined
  hourlyStats: ProviderStatsGroup[] | undefined
  isLoading: boolean
}

/** 主题色变量引用（非硬编码色值，符合 frontend/37-visual-style.md）：蓝=缓存 / 橙=非缓存 / 绿=输出 / 灰=总输入 */
const COLOR_BLUE = 'hsl(var(--chart-1))'
const COLOR_ORANGE = 'hsl(var(--chart-2))'
const COLOR_GREEN = 'hsl(var(--chart-3))'
const COLOR_GRAY = 'hsl(var(--chart-4))'

/** Token 趋势 3 线定义：总输入(灰) / 缓存(蓝) / 非缓存(橙) */
const TOKEN_LINES = [
  { key: 'tokensIn', name: '总输入', color: COLOR_GRAY },
  { key: 'cacheTokens', name: '缓存', color: COLOR_BLUE },
  { key: 'uncachedTokens', name: '非缓存', color: COLOR_ORANGE },
]

/** 花费趋势 3 线定义：缓存(蓝) / 非缓存(橙) / 输出(绿) */
const COST_LINES = [
  { key: 'cacheCost', name: '缓存', color: COLOR_BLUE },
  { key: 'uncachedCost', name: '非缓存', color: COLOR_ORANGE },
  { key: 'outputCost', name: '输出', color: COLOR_GREEN },
]

/** 把 StatsDataPoint.period 格式化为图表 X 轴标签：
 * 24h period 为 'YYYY-MM-DD HH'，显示 'HH:00'（近24个整点小时）；
 * 30d period 为 'YYYY-MM-DD'，显示 'MM-DD'。 */
function formatPeriod(period: number | string, tab: TrendTab): number | string {
  if (tab === '24h') {
    // 'YYYY-MM-DD HH' → 'HH:00'
    const s = String(period)
    const hh = s.slice(11, 13)
    return `${hh}:00`
  }
  // 30d：period 为 'YYYY-MM-DD'，截取后 5 位得 'MM-DD'
  return typeof period === 'string' ? period.slice(5) : String(period)
}

/** 空数据点（缺数据的时段填 0，保证 X 轴完整）。 */
const ZERO_POINT: Omit<StatsDataPoint, 'period'> = {
  requests: 0,
  tokensIn: 0,
  tokensOut: 0,
  cacheTokens: 0,
  cost: 0,
  cacheCost: 0,
  uncachedCost: 0,
  outputCost: 0,
}

/** 把 Date 格式化为 'YYYY-MM-DD HH' 整点小时键（24h period 格式，本地时区）。 */
function toHourKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}`
}

/** 把 Date 格式化为 'YYYY-MM-DD' 日期键（30d period 格式，本地时区）。 */
function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 生成完整 period 序列与现有 dataPoints 合并，缺失时段填 0：
 * 24h = 近24个整点小时（从当前小时往前推24个，period 'YYYY-MM-DD HH'）；
 * 30d = 近31天（period 'YYYY-MM-DD'，对齐后端 stat_date >= date('now','-30 days')）。
 * 避免图表只画有数据的零星几个点，X 轴完整展示时间跨度。
 */
function fillMissingPeriods(dataPoints: StatsDataPoint[], tab: TrendTab): StatsDataPoint[] {
  const byPeriod = new Map<string, StatsDataPoint>()
  for (const p of dataPoints) {
    byPeriod.set(String(p.period), p)
  }

  const fullPeriods: string[] = []
  const now = new Date()
  if (tab === '24h') {
    // 从当前整点小时往前推 24 个小时，共 25 个桶（首=昨天同一小时，尾=当前小时）。
    // 例：当前12:34 → 昨天12:00 ~ 今天12:00，两端都含12点。
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now)
      d.setHours(d.getHours() - i)
      fullPeriods.push(toHourKey(d))
    }
  } else {
    // 近31天
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      fullPeriods.push(toDateKey(d))
    }
  }

  return fullPeriods.map((period) => {
    const existing = byPeriod.get(period)
    if (existing) return existing
    return { period, ...ZERO_POINT } as StatsDataPoint
  })
}

/** 由单模型的 dataPoints 构建 3 张趋势图所需的数据数组（补全缺失时段为 0）。 */
function buildChartData(dataPoints: StatsDataPoint[], tab: TrendTab) {
  const filled = fillMissingPeriods(dataPoints, tab)
  const tokenData = filled.map((p) => ({
    period: formatPeriod(p.period, tab),
    tokensIn: p.tokensIn,
    cacheTokens: p.cacheTokens,
    // 非缓存 token = 总输入 - 缓存，clamp≥0（防御 cacheTokens > tokensIn 的脏数据）
    uncachedTokens: Math.max(0, p.tokensIn - p.cacheTokens),
  }))
  const costData = filled.map((p) => ({
    period: formatPeriod(p.period, tab),
    cacheCost: p.cacheCost,
    uncachedCost: p.uncachedCost,
    outputCost: p.outputCost,
  }))
  const barData = filled.map((p) => ({
    period: formatPeriod(p.period, tab),
    requests: p.requests,
  }))
  return { tokenData, costData, barData }
}

/** 单模型的 3 张趋势图：Token / 花费 / 次数。 @returns 3 张图网格 JSX。 */
function ModelTrendCharts({ dataPoints, tab }: { dataPoints: StatsDataPoint[]; tab: TrendTab }) {
  const { tokenData, costData, barData } = buildChartData(dataPoints, tab)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="border-border/50 p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Token 趋势</div>
        <TrendLineChart data={tokenData} xKey="period" lines={TOKEN_LINES} height={100} />
      </Card>
      <Card className="border-border/50 p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">花费趋势</div>
        <TrendLineChart data={costData} xKey="period" lines={COST_LINES} height={100} />
      </Card>
      <Card className="border-border/50 p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">次数趋势</div>
        <TrendBarChart data={barData} height={100} />
      </Card>
    </div>
  )
}

/** 供应商手风琴卡片：折叠态显示摘要，展开态逐模型渲染 3 张趋势图。 @returns 供应商卡片 JSX。 */
function ProviderAccordionCard({
  group,
  isExpanded,
  onToggle,
  tab,
}: {
  group: ProviderStatsGroup
  isExpanded: boolean
  onToggle: () => void
  tab: TrendTab
}) {
  const totalRequests = group.models.reduce((s, m) => s + m.totalRequests, 0)
  const totalTokens = group.models.reduce((s, m) => s + m.totalTokensIn + m.totalTokensOut, 0)
  return (
    <Card className="border-border/50 overflow-hidden">
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left justify-start h-auto"
      >
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span className="w-2 h-2 rounded-full bg-primary" />
        <span className="font-medium text-foreground">{group.providerName}</span>
        <Badge variant="secondary" className="text-xs">{group.models.length} 个模型</Badge>
        <span className="text-muted-foreground text-sm">{totalRequests.toLocaleString()} 次调用</span>
        <span className="text-muted-foreground text-xs">| {totalTokens.toLocaleString()} tokens</span>
      </Button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
          >
            <div className="p-5">
              {group.models.map((model, idx) => (
                <div key={model.model} className={idx > 0 ? 'border-t border-border/50 pt-4 mt-4' : ''}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="font-medium text-foreground">{model.model}</span>
                    <Badge variant="outline" className="text-xs">{model.totalRequests} 次</Badge>
                    <span className="text-xs text-muted-foreground">
                      | 输入 {model.totalTokensIn.toLocaleString()} · 输出 {model.totalTokensOut.toLocaleString()} tokens
                    </span>
                  </div>
                  <ModelTrendCharts dataPoints={model.dataPoints} tab={tab} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

/**
 * 时间趋势手风琴：顶部 24h/30d Tab 切换数据源，手风琴按供应商展开后逐模型显示 3 张趋势图。
 * @param dailyStats - 30 天日维度统计分组
 * @param hourlyStats - 24 小时明细统计分组
 * @param isLoading - 是否正在加载
 * @returns 时间趋势手风琴 JSX
 */
export function TimeTrendAccordion({ dailyStats, hourlyStats, isLoading }: TimeTrendAccordionProps) {
  const [activeTab, setActiveTab] = useState<TrendTab>('24h')
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null)

  if (isLoading) return <Skeleton className="h-48 w-full" />

  // 两个 query 均预加载，Tab 仅切换显示哪个数据源
  const activeStats = activeTab === '24h' ? hourlyStats : dailyStats

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">时间趋势</h2>
        <div role="tablist" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['24h', '30d'] as const).map((tab) => (
            <Button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab)}
              className="px-3 h-7 text-xs"
            >
              {tab}
            </Button>
          ))}
        </div>
      </div>
      {!activeStats || activeStats.length === 0 ? (
        <EmptyState title="暂无统计数据" description="发送请求后自动生成" />
      ) : (
        <div className="space-y-2">
          {activeStats.map((group) => (
            <ProviderAccordionCard
              key={group.providerId}
              group={group}
              isExpanded={expandedProvider === group.providerId}
              onToggle={() =>
                setExpandedProvider(expandedProvider === group.providerId ? null : group.providerId)
              }
              tab={activeTab}
            />
          ))}
        </div>
      )}
    </>
  )
}
