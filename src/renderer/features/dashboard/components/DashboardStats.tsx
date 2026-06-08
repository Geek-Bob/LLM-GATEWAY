/**
 * DashboardStatsGrid — 仪表盘统计卡片网格
 *
 * 展示 4 个核心指标卡片：近 7 日请求数、Token 消耗、供应商标记、平均延迟
 * 基于 StatsCard 组件，接收统计数据和供应商计数作为 props
 *
 * @param stats - 7 天概览统计数据
 * @param activeProviders - 已启用的供应商数量
 * @param totalProviders - 供应商总数
 */

import type { DashboardStats } from '@/lib/types'
import { StatsCard } from '@/features/dashboard/components/StatsCard'
import { BarChart3, Coins, Building2, Zap } from 'lucide-react'

interface DashboardStatsGridProps {
  stats: DashboardStats | undefined
  activeProviders: number
  totalProviders: number
}

/** 仪表盘统计卡片网格，展示近 7 日请求数、Token 消耗、供应商数、平均延迟。 @returns 统计卡片网格 JSX。 */
export function DashboardStatsGrid({ stats, activeProviders, totalProviders }: DashboardStatsGridProps) {
  const cards = [
    {
      title: '近 7 日请求',
      value: stats?.totalRequests ?? 0,
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      title: 'Token 消耗',
      value: stats
        ? (stats.totalTokensIn + stats.totalTokensOut).toLocaleString()
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
