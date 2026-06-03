import { getLogStats } from '../../db/logs'

/**
 * 创建统计业务服务
 * 当前仅提供概要统计功能，为 Dashboard 页面提供数据支撑
 * 详细统计能力由 logs domain 的 detailedStats 提供
 */
export function createStatsService() {
  return {
    /** 获取指定时间范围的概要统计（总请求数、成功率、Token 用量等） */
    summary: async (range: string) => {
      return getLogStats({ range })
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
