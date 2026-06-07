import { z } from 'zod'

/**
 * 日志查询参数校验 schema
 * page/limit 用于分页，providerId/dateFrom/dateTo 为可选过滤条件
 */
export const queryLogsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  providerId: z.number().int().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
})

/**
 * 统计时间范围校验 schema
 * 仅接受 24h / 7d / 30d 三个合法值
 */
export const statsRangeSchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('7d')
})

/**
 * 详细统计时间范围校验 schema
 * 仅接受 24h / 30d 两个合法值
 */
export const detailedStatsRangeSchema = z.object({
  range: z.enum(['24h', '30d'])
})
