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
  /** 缓存命中输入 Token 数（透传自 request_stats.total_cache_tokens） */
  cacheTokens: number
  avgDurationMs: number
  totalErrors: number
  /** 总费用（元，透传自 getCostSummary.totalCost） */
  totalCost: number
}
