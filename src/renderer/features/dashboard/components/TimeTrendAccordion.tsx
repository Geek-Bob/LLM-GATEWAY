/**
 * TimeTrendAccordion — 时间趋势手风琴
 *
 * 按供应商分组展示 24h 柱状图和 30 天面积图
 * 点击供应商行展开/折叠该供应商下的模型图表
 * 展开时通过 AnimatePresence 实现高度过渡动画
 *
 * @param dailyStats - 30 天日维度统计分组数据
 * @param hourlyStats - 24 小时明细统计数据（用于柱状图）
 * @param isLoading - 是否正在加载
 */

import { useState } from 'react'
import type { ProviderStatsGroup, StatsDataPoint } from '@/lib/types'
import { HourlyBarChart, DailyAreaChart } from '@/features/dashboard/components/StatsCharts'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface TimeTrendAccordionProps {
  dailyStats: ProviderStatsGroup[] | undefined
  hourlyStats: ProviderStatsGroup[] | undefined
  isLoading: boolean
}

/** 时间趋势手风琴，按供应商分组展示 24h 柱状图和 30 天面积图。 @returns 时间趋势手风琴 JSX。 */
export function TimeTrendAccordion({ dailyStats, hourlyStats, isLoading }: TimeTrendAccordionProps) {
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null)

  /** 查找指定供应商+模型的 24h 柱状图数据 */
  function findHourlyData(providerId: number, model: string): StatsDataPoint[] {
    const p = hourlyStats?.find((g) => g.providerId === providerId)
    return p?.models.find((m) => m.model === model)?.dataPoints ?? []
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!dailyStats || dailyStats.length === 0) {
    return <EmptyState title="暂无统计数据" description="发送请求后自动生成" />
  }

  return (
    <>
      <h2 className="text-base font-semibold mb-4 text-foreground">时间趋势</h2>
      <div className="space-y-2">
        {dailyStats.map((group) => (
          <Card key={group.providerId} className="border-border/50 overflow-hidden">
            <Button
              variant="ghost"
              onClick={() => setExpandedProvider(expandedProvider === group.providerId ? null : group.providerId)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left justify-start h-auto"
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
            </Button>

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
    </>
  )
}
