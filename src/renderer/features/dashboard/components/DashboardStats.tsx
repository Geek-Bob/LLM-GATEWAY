/**
 * DashboardStatsGrid — 仪表盘统计卡片网格
 *
 * 展示 4 个核心指标卡片：近 7 日请求数、Token 消耗、近 7 天花费、平均延迟
 * 基于 StatsCard 组件，接收统计数据作为 props
 *（activeProviders/totalProviders 保留传参以兼容 Dashboard 调用方，本网格不再展示）
 *
 * @param stats - 7 天概览统计数据
 * @param activeProviders - 保留传参以兼容（本网格不再展示）
 * @param totalProviders - 保留传参以兼容（本网格不再展示）
 */

import type { DashboardStats } from '@/lib/types'
import { StatsCard } from '@/features/dashboard/components/StatsCard'
import { BarChart3, Coins, DollarSign, Zap } from 'lucide-react'

interface DashboardStatsGridProps {
  stats: DashboardStats | undefined
  activeProviders: number
  totalProviders: number
}

/** 格式化费用为字符串（2-4 位小数，美元），与 RangeSummaryCard 保持视觉一致。 @param cost 费用数值 @returns 形如 "$1.2345" 的字符串 */
function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost)
}

/** 仪表盘统计卡片网格，展示近 7 日请求数、Token 消耗、近 7 天花费、平均延迟。 @returns 统计卡片网格 JSX。 */
export function DashboardStatsGrid({ stats }: DashboardStatsGridProps) {
  // activeProviders/totalProviders 保留在 props 接口中以兼容 Dashboard 调用方；第 3 卡已改为展示近 7 天花费
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
