/**
 * 日志统计数据访问层（Repository 模式）
 *
 * 预聚合统计：每次请求结束时写入一行"增量"，通过 ON CONFLICT ... DO UPDATE 合并。
 * 按小时粒度聚合，支持 24h / 7d / 30d 范围的聚合查询。
 * 避免每次查询时全量扫描 NDJSON 文件。
 *
 * 费用计算：单价存 provider_pricing 表（元/百万tokens），查询时 LEFT JOIN 实时算。
 * 全局表 request_stats 无 model 维度，费用通过 request_stats_provider JOIN pricing 计算。
 */

import type { Database } from './database'

/**
 * 把 Date 格式化为本地时区 'YYYY-MM-DD' 日期串。
 * 与 stat_hour（getHours，本地）统一时区，避免之前 toISOString(UTC) 与本地小时混用导致跨天错位。
 */
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 费用换算分母：单价单位为元/百万tokens，结果为元 */
const COST_DIVISOR = 1_000_000

/**
 * 解析时间范围 → SQL 日期过滤条件
 * @param range - '24h' | '7d' | '30d'（其他值降级为 7d）
 */
function resolveDateCondition(range: string): string {
  // stat_date 为本地时区日期（localDateStr），故用 date('now','localtime') 对齐本地时区
  switch (range) {
    case '24h': return "stat_date = date('now', 'localtime')"
    case '7d': return "stat_date >= date('now', 'localtime', '-7 days')"
    case '30d': return "stat_date >= date('now', 'localtime', '-30 days')"
    default: return "stat_date >= date('now', 'localtime', '-7 days')"
  }
}

/**
 * 创建 LogStats Repository 实例
 *
 * @param db - Database 实例
 * @returns LogStats Repository 对象
 */
export function createLogStatsRepository(db: Database) {
  /**
   * 费用汇总内部实现（闭包，通过 db 访问注入实例）。
   * 基于 request_stats_provider LEFT JOIN provider_pricing，按 provider_id+model 聚合后 SUM。
   * 缺单价（JOIN 不到）费用按 0（COALESCE）；非缓存输入 clamp 到 0（MAX(0, ...)）。
   * @param range - '24h' | '7d' | '30d'
   * @returns { totalCost, cacheCost, uncachedCost, outputCost }（元）
   */
  function getCostSummary(range: string): {
    totalCost: number
    cacheCost: number
    uncachedCost: number
    outputCost: number
  } {
    const dateCondition = resolveDateCondition(range)
    const row = db.prepare(
      `SELECT
        COALESCE(SUM(pm.total_cost), 0) as total_cost,
        COALESCE(SUM(pm.cache_cost), 0) as cache_cost,
        COALESCE(SUM(pm.uncached_cost), 0) as uncached_cost,
        COALESCE(SUM(pm.output_cost), 0) as output_cost
      FROM (
        SELECT
          COALESCE(
            SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}
            + MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}
            + SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR},
            0
          ) as total_cost,
          COALESCE(SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}, 0) as cache_cost,
          COALESCE(MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}, 0) as uncached_cost,
          COALESCE(SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR}, 0) as output_cost
        FROM request_stats_provider rsp
        LEFT JOIN provider_pricing pp ON pp.provider_id = rsp.provider_id AND pp.model = rsp.model
        WHERE ${dateCondition}
        GROUP BY rsp.provider_id, rsp.model
      ) pm`
    ).get() as Record<string, unknown> | undefined

    return {
      totalCost: Number(row?.total_cost) || 0,
      cacheCost: Number(row?.cache_cost) || 0,
      uncachedCost: Number(row?.uncached_cost) || 0,
      outputCost: Number(row?.output_cost) || 0
    }
  }

  return {
    /** 写入全局请求统计（按日期+小时聚合，含错误计数与缓存 token） */
    async updateRequestStats(entry: {
      tokensIn?: number
      tokensOut?: number
      cacheTokens?: number
      durationMs?: number
      statusCode?: number
    }): Promise<void> {
      const now = new Date()
      const dateStr = localDateStr(now)
      const hour = now.getHours()
      const tokensIn = entry.tokensIn ?? 0
      const tokensOut = entry.tokensOut ?? 0
      const cacheTokens = entry.cacheTokens ?? 0
      const durationMs = entry.durationMs ?? 0
      const errorCount = entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

      db.prepare(
        `INSERT INTO request_stats (stat_date, stat_hour, total_requests, total_tokens_in, total_tokens_out, total_cache_tokens, total_errors, total_duration_ms)
         VALUES (@date, @hour, 1, @tokensIn, @tokensOut, @cacheTokens, @errorCount, @durationMs)
         ON CONFLICT(stat_date, stat_hour) DO UPDATE SET
           total_requests = total_requests + 1,
           total_tokens_in = total_tokens_in + @tokensIn,
           total_tokens_out = total_tokens_out + @tokensOut,
           total_cache_tokens = total_cache_tokens + @cacheTokens,
           total_errors = total_errors + @errorCount,
           total_duration_ms = total_duration_ms + @durationMs`
      ).run({ date: dateStr, hour, tokensIn, tokensOut, cacheTokens, errorCount, durationMs })
    },

    /** 写入按供应商+模型维度的统计（含缓存 token） */
    async updateProviderStats(entry: {
      providerId?: number
      model: string
      tokensIn?: number
      tokensOut?: number
      cacheTokens?: number
      durationMs?: number
      statusCode?: number
    }): Promise<void> {
      if (entry.providerId === undefined) return
      const now = new Date()
      const dateStr = localDateStr(now)
      const hour = now.getHours()
      const tokensIn = entry.tokensIn ?? 0
      const tokensOut = entry.tokensOut ?? 0
      const cacheTokens = entry.cacheTokens ?? 0
      const durationMs = entry.durationMs ?? 0
      const errorCount = entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

      db.prepare(
        `INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_cache_tokens, total_errors, total_duration_ms)
         VALUES (@date, @hour, @providerId, @model, 1, @tokensIn, @tokensOut, @cacheTokens, @errorCount, @durationMs)
         ON CONFLICT(stat_date, stat_hour, provider_id, model) DO UPDATE SET
           total_requests = total_requests + 1,
           total_tokens_in = total_tokens_in + @tokensIn,
           total_tokens_out = total_tokens_out + @tokensOut,
           total_cache_tokens = total_cache_tokens + @cacheTokens,
           total_errors = total_errors + @errorCount,
           total_duration_ms = total_duration_ms + @durationMs`
      ).run({ date: dateStr, hour, providerId: entry.providerId, model: entry.model, tokensIn, tokensOut, cacheTokens, errorCount, durationMs })
    },

    /**
     * 获取指定时间范围的全局统计汇总。
     * 全局表 request_stats 无 model 维度，仅返回 token 概览；费用通过 getCostSummary
     * （基于 request_stats_provider JOIN provider_pricing）计算后一并返回 total_cost。
     */
    async getStats(range: string): Promise<Record<string, unknown>> {
      const dateCondition = resolveDateCondition(range)

      const row = db.prepare(
        `SELECT
          COALESCE(SUM(total_requests), 0) as total_requests,
          COALESCE(SUM(total_tokens_in), 0) as total_tokens_in,
          COALESCE(SUM(total_tokens_out), 0) as total_tokens_out,
          COALESCE(SUM(total_cache_tokens), 0) as total_cache_tokens,
          CASE WHEN SUM(total_requests) > 0
            THEN SUM(total_duration_ms) * 1.0 / SUM(total_requests)
            ELSE 0 END as avg_duration_ms,
          COALESCE(SUM(total_errors), 0) as total_errors
        FROM request_stats
        WHERE ${dateCondition}`
      ).get() as Record<string, unknown> | undefined

      const base = row ?? {
        total_requests: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        total_cache_tokens: 0,
        avg_duration_ms: 0,
        total_errors: 0
      }
      // 费用走 provider 维度表 JOIN pricing（全局表无 model 无法逐模型计费）
      const cost = getCostSummary(range)
      return { ...base, total_cost: cost.totalCost }
    },

    /**
     * 获取 24h / 30d 全局汇总（token 三分 + 费用三分 + totalRequests）。
     * 基于 request_stats_provider LEFT JOIN provider_pricing，返回 snake_case 字段。
     * 字段：total_tokens/input_tokens/cache_tokens/uncached_tokens/output_tokens/
     *      total_cost/cache_cost/uncached_cost/output_cost/total_requests
     * @param range - '24h' | '30d'
     */
    async getRangeSummary(range: '24h' | '30d'): Promise<Record<string, unknown>> {
      const dateCondition = resolveDateCondition(range)

      const row = db.prepare(
        `SELECT
          COALESCE(SUM(pm.total_requests), 0) as total_requests,
          COALESCE(SUM(pm.input_tokens), 0) as input_tokens,
          COALESCE(SUM(pm.cache_tokens), 0) as cache_tokens,
          COALESCE(SUM(pm.uncached_tokens), 0) as uncached_tokens,
          COALESCE(SUM(pm.output_tokens), 0) as output_tokens,
          COALESCE(SUM(pm.cache_cost), 0) as cache_cost,
          COALESCE(SUM(pm.uncached_cost), 0) as uncached_cost,
          COALESCE(SUM(pm.output_cost), 0) as output_cost,
          COALESCE(SUM(pm.total_cost), 0) as total_cost
        FROM (
          SELECT
            SUM(rsp.total_requests) as total_requests,
            SUM(rsp.total_tokens_in) as input_tokens,
            SUM(rsp.total_cache_tokens) as cache_tokens,
            MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) as uncached_tokens,
            SUM(rsp.total_tokens_out) as output_tokens,
            -- 每模型费用（缺单价 COALESCE 为 0）；单价单位元/百万tokens，除以 1e6 得元
            COALESCE(
              SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}
              + MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}
              + SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR},
              0
            ) as total_cost,
            COALESCE(SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}, 0) as cache_cost,
            COALESCE(MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}, 0) as uncached_cost,
            COALESCE(SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR}, 0) as output_cost
          FROM request_stats_provider rsp
          LEFT JOIN provider_pricing pp ON pp.provider_id = rsp.provider_id AND pp.model = rsp.model
          WHERE ${dateCondition}
          GROUP BY rsp.provider_id, rsp.model
        ) pm`
      ).get() as Record<string, unknown> | undefined

      if (!row) {
        return {
          total_requests: 0,
          input_tokens: 0,
          cache_tokens: 0,
          uncached_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cache_cost: 0,
          uncached_cost: 0,
          output_cost: 0,
          total_cost: 0
        }
      }
      const inputTokens = Number(row.input_tokens) || 0
      const outputTokens = Number(row.output_tokens) || 0
      return { ...row, total_tokens: inputTokens + outputTokens }
    },

    /**
     * 清空两张预聚合统计表（运行数据清空）。
     * 依次执行 DELETE FROM request_stats 和 DELETE FROM request_stats_provider，
     * 使仪表盘统计回到"从未请求"的初始态。供 DataManagementService 在运行数据清空时调用。
     */
    async clearAll(): Promise<void> {
      db.prepare('DELETE FROM request_stats').run()
      db.prepare('DELETE FROM request_stats_provider').run()
    },

    /**
     * 获取按供应商/模型维度的详细统计。
     * 每行含 cacheTokens 与费用三分时序（cache_cost/uncached_cost/output_cost），
     * cost = 三者之和（LEFT JOIN provider_pricing 逐模型算费用，缺单价 COALESCE 为 0）。
     * @param range - '24h' 按小时分组 | '30d' 按日期分组
     */
    async getDetailedStats(range: '24h' | '30d'): Promise<Record<string, unknown>[]> {
      // 24h = 近24个整点小时（滚动窗口，period 为 'YYYY-MM-DD HH'）；30d = 近31天（period 为 'YYYY-MM-DD'）
      if (range === '24h') {
        // 窗口起点 = 当前整点小时往前推 24 小时（含当前小时共 25 个桶，首=昨天同一小时、尾=当前小时）。
        // 例：当前12:34 → 昨天12:00 ~ 今天12:00。stat_date/stat_hour 均本地时区，字典序比较一致。
        const winStart = new Date()
        winStart.setHours(winStart.getHours() - 24, 0, 0, 0)
        const windowStart = `${localDateStr(winStart)} ${String(winStart.getHours()).padStart(2, '0')}:00:00`
        return db.prepare(
          `SELECT
            rsp.provider_id as provider_id,
            rsp.model as model,
            rsp.stat_date || ' ' || printf('%02d', rsp.stat_hour) as period,
            SUM(rsp.total_requests) as total_requests,
            SUM(rsp.total_tokens_in) as total_tokens_in,
            SUM(rsp.total_tokens_out) as total_tokens_out,
            SUM(rsp.total_cache_tokens) as total_cache_tokens,
            SUM(rsp.total_errors) as total_errors,
            COALESCE(SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}, 0) as cache_cost,
            COALESCE(MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}, 0) as uncached_cost,
            COALESCE(SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR}, 0) as output_cost,
            COALESCE(
              SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}
              + MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}
              + SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR},
              0
            ) as cost
          FROM request_stats_provider rsp
          LEFT JOIN provider_pricing pp ON pp.provider_id = rsp.provider_id AND pp.model = rsp.model
          WHERE rsp.stat_date || ' ' || printf('%02d', rsp.stat_hour) || ':00:00' >= @windowStart
          GROUP BY rsp.provider_id, rsp.model, period
          ORDER BY rsp.provider_id, rsp.model, period`
        ).all({ windowStart }) as Record<string, unknown>[]
      }

      const dateCondition = resolveDateCondition(range)
      const periodCol = 'stat_date'

      return db.prepare(
        `SELECT
          rsp.provider_id as provider_id,
          rsp.model as model,
          ${periodCol} as period,
          SUM(rsp.total_requests) as total_requests,
          SUM(rsp.total_tokens_in) as total_tokens_in,
          SUM(rsp.total_tokens_out) as total_tokens_out,
          SUM(rsp.total_cache_tokens) as total_cache_tokens,
          SUM(rsp.total_errors) as total_errors,
          -- 费用三分时序：单价单位元/百万tokens，除以 1e6 得元；缺单价 COALESCE 为 0
          COALESCE(SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}, 0) as cache_cost,
          COALESCE(MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}, 0) as uncached_cost,
          COALESCE(SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR}, 0) as output_cost,
          COALESCE(
            SUM(rsp.total_cache_tokens) * pp.price_in_cached / ${COST_DIVISOR}
            + MAX(0, SUM(rsp.total_tokens_in) - SUM(rsp.total_cache_tokens)) * pp.price_in_uncached / ${COST_DIVISOR}
            + SUM(rsp.total_tokens_out) * pp.price_out / ${COST_DIVISOR},
            0
          ) as cost
        FROM request_stats_provider rsp
        LEFT JOIN provider_pricing pp ON pp.provider_id = rsp.provider_id AND pp.model = rsp.model
        WHERE ${dateCondition}
        GROUP BY rsp.provider_id, rsp.model, ${periodCol}
        ORDER BY rsp.provider_id, rsp.model, ${periodCol}`
      ).all() as Record<string, unknown>[]
    },
  }
}

export type LogStatsRepository = ReturnType<typeof createLogStatsRepository>
