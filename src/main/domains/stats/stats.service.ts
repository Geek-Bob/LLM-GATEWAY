import type { Database } from '../../db/database'
import { getLogStats } from '../../db/logs'

export function createStatsService(_db: Database) {
  return {
    summary: async (range: string) => {
      return getLogStats({ range })
    }
  }
}

export type StatsService = ReturnType<typeof createStatsService>
