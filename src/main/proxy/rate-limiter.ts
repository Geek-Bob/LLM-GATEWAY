export interface RateLimitResult {
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

    // Remove timestamps outside the current sliding window
    timestamps = timestamps.filter(ts => ts > windowStart)

    if (timestamps.length >= limit) {
      const resetAt = timestamps[0] + this.windowMs

      // Schedule automatic cleanup of this key once the window passes
      setTimeout(() => {
        this.windows.delete(key)
      }, this.windowMs)

      return { allowed: false, remaining: 0, resetAt }
    }

    // Record the current request timestamp
    timestamps.push(now)
    this.windows.set(key, timestamps)

    const resetAt =
      timestamps.length === 1
        ? now + this.windowMs
        : timestamps[0] + this.windowMs

    return { allowed: true, remaining: limit - timestamps.length, resetAt }
  }
}
