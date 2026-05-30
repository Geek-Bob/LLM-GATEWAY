import { getLogStats } from '../../db/logs'

export function createStatsService() {
  return {
    summary: async (range: string) => {
      return getLogStats({ range })
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
