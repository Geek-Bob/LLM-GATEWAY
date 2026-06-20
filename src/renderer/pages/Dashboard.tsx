/**
 * Dashboard 页面 — 系统概览与服务状态
 *
 * 薄层组合页面，组装 6 个子组件：
 * - ProxyControlCard: 代理服务状态与控制
 * - DashboardStatsGrid: 核心指标卡片网格
 * - StatsSummaryTable: 调用统计汇总表格
 * - RangeSummaryCard: 24h/30d 时间窗口汇总卡（2 张）
 * - TimeTrendAccordion: 时间趋势图表手风琴
 *
 * 数据流：通过 TanStack Query hooks 获取数据，以 props 下发给子组件
 */

import { useDashboardStats, useHourlyStats, useDailyStats } from '@/lib/queries/stats'
import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'
import { Skeleton } from '@/components/ui/skeleton'
import { ProxyControlCard } from '@/features/dashboard/components/ProxyControlCard'
import { DashboardStatsGrid } from '@/features/dashboard/components/DashboardStats'
import { StatsSummaryTable } from '@/features/dashboard/components/StatsSummaryTable'
import { TimeTrendAccordion } from '@/features/dashboard/components/TimeTrendAccordion'
import { RangeSummaryCard } from '@/features/dashboard/components/RangeSummaryCard'

/** 仪表盘页面，展示系统概览、代理状态、统计卡片和趋势图表。 @returns 仪表盘页面 JSX。 */
export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: hourlyStats, isLoading: hourlyLoading } = useHourlyStats()
  const { data: dailyStats, isLoading: dailyLoading } = useDailyStats()

  if (statsLoading) {
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
      <motion.div variants={childVariants} className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">仪表盘</h1>
        <p className="text-sm mt-1 text-muted-foreground">系统概览与服务状态</p>
      </motion.div>

      <motion.div variants={childVariants} className="mb-4">
        <ProxyControlCard />
      </motion.div>

      <motion.div variants={childVariants} className="mb-8">
        <DashboardStatsGrid stats={stats} />
      </motion.div>

      <motion.div variants={childVariants} className="mb-6">
        <StatsSummaryTable dailyStats={dailyStats} isLoading={dailyLoading} />
      </motion.div>

      <motion.div variants={childVariants} className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RangeSummaryCard range="24h" />
        <RangeSummaryCard range="30d" />
      </motion.div>

      <motion.div variants={childVariants}>
        <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={hourlyLoading || dailyLoading} />
      </motion.div>
    </motion.div>
  )
}
