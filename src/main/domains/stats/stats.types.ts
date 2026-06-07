/** 统计查询参数 */
export interface StatsQuery {
  /** 时间范围：24h / 7d / 30d */
  range: '24h' | '7d' | '30d'
}

/** 统计汇总响应 */
export interface StatsResponse {
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  avgDurationMs: number
  totalErrors: number
}
