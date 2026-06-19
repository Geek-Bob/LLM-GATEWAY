import type { LogDebugInfo } from '../../../shared/types'

/** 日志查询参数 */
export interface LogQuery {
  page: number
  limit: number
  providerId?: number
  dateFrom?: string
  dateTo?: string
}

/** 单条日志记录（对外响应格式）。
 *  字段命名采用 snake_case，与 preload/renderer 的 LogEntry 契约一致
 *  （Logs 页面按 snake_case 读取，service 层不再做 camelCase 转换）。 */
export interface LogResponse {
  id: number
  api_key_id: number | null
  provider_id: number | null
  model: string
  api_format: string
  status_code: number
  tokens_in: number
  tokens_out: number
  cache_tokens: number
  duration_ms: number
  error: string | null
  created_at: string
  debug?: LogDebugInfo
}

/** 日志查询结果（含分页信息） */
export interface LogQueryResponse {
  logs: LogResponse[]
  total: number
}

/** 日志概要统计响应 */
export interface LogStatsResponse {
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  avgDurationMs: number
  totalErrors: number
}

/** 详细统计数据中的时间点 */
export interface DetailedStatsDataPoint {
  period: number | string
  requests: number
  tokensIn: number
  tokensOut: number
  /** 缓存命中输入 Token 数（透传自 request_stats_provider.total_cache_tokens） */
  cacheTokens: number
  /** 该时间点费用（元，JOIN provider_pricing 逐模型算好） */
  cost: number
}

/** 详细统计数据中的模型维度 */
export interface DetailedStatsModel {
  model: string
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  /** 缓存命中输入 Token 数（跨时间点累加） */
  cacheTokens: number
  totalErrors: number
  /** 该模型总费用（跨时间点累加，元） */
  cost: number
  dataPoints: DetailedStatsDataPoint[]
}

/** 详细统计数据中的供应商维度 */
export interface DetailedStatsProvider {
  providerId: number
  providerName: string
  models: DetailedStatsModel[]
}
