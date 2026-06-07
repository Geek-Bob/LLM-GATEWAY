import { z } from 'zod'

/**
 * 统计查询参数校验 schema
 * range 仅接受 24h / 7d / 30d 三个合法值，默认 7d
 */
export const statsQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('7d')
})
