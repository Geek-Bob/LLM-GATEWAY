/**
 * DashboardStatsGrid — 仪表盘统计卡片网格
 *
 * 展示 4 个核心指标卡片：近 7 日请求数、Token 消耗、近 7 天花费、平均延迟
 * 基于 StatsCard 组件，接收统计数据作为 props
 */

import type { DashboardStats } from '@/lib/types'
import { formatCost } from '@/lib/utils'
import { StatsCard } from '@/features/dashboard/components/StatsCard'
import { BarChart3, Coins, DollarSign, Zap } from 'lucide-react'

interface DashboardStatsGridProps {
  stats: DashboardStats | undefined
}

/** 仪表盘统计卡片网格，展示近 7 日请求数、Token 消耗、近 7 天花费、平均延迟。 @returns 统计卡片网格 JSX。 */
export function DashboardStatsGrid({ stats }: DashboardStatsGridProps) {
  const cards = [
    {
      title: '近 7 日请求',
      value: stats?.totalRequests ?? 0,
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      title: '近 7 日 Token 消耗',
      value: stats
        ? (stats.totalTokensIn + stats.totalTokensOut).toLocaleString()
        : '0',
      icon: <Coins className="w-5 h-5" />,
    },
    {
      title: '近 7 天花费',
      value: formatCost(stats?.totalCost ?? 0),
      icon: <DollarSign className="w-5 h-5" />,
    },
    {
      title: '近 7 日平均延迟',
      value: stats ? `${Math.round(stats.avgDurationMs)}ms` : '0ms',
      icon: <Zap className="w-5 h-5" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <StatsCard key={card.title} {...card} />
      ))}
    </div>
  )
}
