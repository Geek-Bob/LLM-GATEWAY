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
/** 滑动窗口默认时长（毫秒），即 1 分钟 */
const DEFAULT_WINDOW_MS = 60_000

interface RateLimitResult {
  isAllowed: boolean
  remaining: number
  resetAt: number
}

/**
 * 滑动窗口限流器，以 API Key 为粒度限制每分钟最大请求数。
 * 使用内存 Map 存储时间戳数组，窗口外的时间戳自动过期。
 */
export class RateLimiter {
  private windows: Map<string, number[]> = new Map()
  private windowMs: number

  /**
   * @param windowMs - 滑动窗口时长（毫秒），默认 60000（1 分钟）
   */
  constructor(windowMs: number = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs
  }

  /**
   * 检查指定 key 是否允许通过限流。
   * @param key - 限流键（通常为 API Key ID）
   * @param limit - 窗口内最大允许请求数
   * @returns 包含 allowed（是否允许）、remaining（剩余配额）、resetAt（重置时间戳）的结果
   */
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

      return { isAllowed: false, remaining: 0, resetAt }
    }

    // 记录当前请求时间戳
    timestamps.push(now)
    this.windows.set(key, timestamps)

    const resetAt =
      timestamps.length === 1
        ? now + this.windowMs
        : timestamps[0] + this.windowMs

    return { isAllowed: true, remaining: limit - timestamps.length, resetAt }
  }
}
