/**
 * 滑动窗口限流器
 *
 * 基于内存的滑动窗口算法，以 API Key 为粒度限制每分钟最大请求数。
 * 每个 key 维护一个时间戳数组，落在窗口外的时间戳自动过期。
 *
 * 关键设计：
 * - 使用 Map 而非 Redis/外部存储，适合单进程桌面应用
 * - 滑动窗口比固定窗口更平滑，避免流量毛刺
 * - 限流上限来自 ApiKeyRow.rate_limit 字段，默认 60 次/分钟
 * - 被限流的 key 通过 setTimeout 延迟清理，避免内存泄漏
 *
 * resetAt 计算：
 * - 如果已满了，返回最早时间戳 + 窗口时长（即何时可恢复）
 * - 如果未满，返回窗口开始时间 + 窗口时长
 */
interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export class RateLimiter {
  private windows: Map<string, number[]> = new Map()
  private windowMs: number

  constructor(windowMs: number = 60000) {
    this.windowMs = windowMs
  }

  check(key: string, limit: number): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.windows.get(key) || []

    // 移除窗口外的时间戳（滑动窗口）
    timestamps = timestamps.filter(ts => ts > windowStart)

    if (timestamps.length >= limit) {
      const resetAt = timestamps[0] + this.windowMs

      // 延迟清理该 key 的缓存，避免内存泄漏
      setTimeout(() => {
        this.windows.delete(key)
      }, this.windowMs)

      return { allowed: false, remaining: 0, resetAt }
    }

    // 记录当前请求时间戳
    timestamps.push(now)
    this.windows.set(key, timestamps)

    const resetAt =
      timestamps.length === 1
        ? now + this.windowMs
        : timestamps[0] + this.windowMs

    return { allowed: true, remaining: limit - timestamps.length, resetAt }
  }
}
