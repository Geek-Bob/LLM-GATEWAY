/**
 * NDJSON 日志统计层
 *
 * 预聚合统计：每次请求结束时写入一行"增量"，通过 ON CONFLICT ... DO UPDATE 合并。
 * 按小时粒度聚合，支持 24h / 7d / 30d 范围的聚合查询。
 * 避免每次查询时全量扫描 NDJSON 文件。
 */

import type { Database } from './database'

/** 写入全局请求统计（按日期+小时聚合，含错误计数）。 */
export function updateRequestStats(
  db: Database,
  entry: {
    tokensIn?: number
    tokensOut?: number
    durationMs?: number
    statusCode?: number
  }
): void {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hour = now.getHours()
  const tokensIn = entry.tokensIn ?? 0
  const tokensOut = entry.tokensOut ?? 0
  const durationMs = entry.durationMs ?? 0
  // 状态码 >= 400 计为一次错误
  const errorCount =
    entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

  db.prepare(
    `INSERT INTO request_stats (stat_date, stat_hour, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
     VALUES (@date, @hour, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
     ON CONFLICT(stat_date, stat_hour) DO UPDATE SET
       total_requests = total_requests + 1,
       total_tokens_in = total_tokens_in + @tokensIn,
       total_tokens_out = total_tokens_out + @tokensOut,
       total_errors = total_errors + @errorCount,
       total_duration_ms = total_duration_ms + @durationMs`
  ).run({
    date: dateStr,
    hour,
    tokensIn,
    tokensOut,
    errorCount,
    durationMs
  })
}

/** 写入按供应商+模型维度的统计。若缺少 providerId 则跳过（如匿名请求）。 */
export function updateProviderStats(db: Database, entry: {
  providerId?: number
  model: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  statusCode?: number
}): void {
  if (entry.providerId === undefined) return // 没有供应商上下文时跳过
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hour = now.getHours()
  const tokensIn = entry.tokensIn ?? 0
  const tokensOut = entry.tokensOut ?? 0
  const durationMs = entry.durationMs ?? 0
  const errorCount = entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

  db.prepare(
    `INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
     VALUES (@date, @hour, @providerId, @model, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
     ON CONFLICT(stat_date, stat_hour, provider_id, model) DO UPDATE SET
       total_requests = total_requests + 1,
       total_tokens_in = total_tokens_in + @tokensIn,
       total_tokens_out = total_tokens_out + @tokensOut,
       total_errors = total_errors + @errorCount,
       total_duration_ms = total_duration_ms + @durationMs`
  ).run({
    date: dateStr,
    hour,
    providerId: entry.providerId,
    model: entry.model,
    tokensIn,
    tokensOut,
    errorCount,
    durationMs
  })
}

/** 获取指定时间范围的全局统计汇总，含平均延迟计算。range 支持 24h / 7d / 30d，默认 7d。 */
export function getLogStats(
  db: Database,
  opts: { range: string }
): Record<string, unknown> {
  let dateCondition: string
  switch (opts.range) {
    case '24h':
      dateCondition = "stat_date = date('now')"
      break
    case '7d':
      dateCondition = "stat_date >= date('now', '-7 days')"
      break
    case '30d':
      dateCondition = "stat_date >= date('now', '-30 days')"
      break
    default:
      dateCondition = "stat_date >= date('now', '-7 days')"
  }

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(total_requests), 0) as total_requests,
        COALESCE(SUM(total_tokens_in), 0) as total_tokens_in,
        COALESCE(SUM(total_tokens_out), 0) as total_tokens_out,
        CASE WHEN SUM(total_requests) > 0
          THEN SUM(total_duration_ms) * 1.0 / SUM(total_requests)
          ELSE 0 END as avg_duration_ms,
        COALESCE(SUM(total_errors), 0) as total_errors
      FROM request_stats
      WHERE ${dateCondition}`
    )
    .get() as Record<string, unknown> | undefined

  return row ?? { total_requests: 0, total_tokens_in: 0, total_tokens_out: 0, avg_duration_ms: 0, total_errors: 0 }
}

/**
 * 获取按供应商/模型维度的详细统计。
 * - range='24h'：按小时分组，返回当天每个小时的数据
 * - range='30d'：按天分组，返回过去 30 天每天的数据
 * 返回值中的 period 字段根据 range 不同对应 stat_hour 或 stat_date。
 */
export function getDetailedStats(db: Database, range: '24h' | '30d'): Record<string, unknown>[] {
  let dateCondition: string
  let groupBy: string

  if (range === '24h') {
    dateCondition = "stat_date = date('now')"
    groupBy = 'stat_hour'
  } else {
    dateCondition = "stat_date >= date('now', '-30 days')"
    groupBy = 'stat_date'
  }

  const rows = db
    .prepare(
      `SELECT
        provider_id,
        model,
        ${groupBy === 'stat_hour' ? 'stat_hour' : 'stat_date'} as period,
        SUM(total_requests) as total_requests,
        SUM(total_tokens_in) as total_tokens_in,
        SUM(total_tokens_out) as total_tokens_out,
        SUM(total_errors) as total_errors
      FROM request_stats_provider
      WHERE ${dateCondition}
      GROUP BY provider_id, model, ${groupBy}
      ORDER BY provider_id, model, ${groupBy}`
    )
    .all() as Record<string, unknown>[]

  return rows
}
