/**
 * IPC handler 错误处理工具
 *
 * 提供统一的 try/catch 包装和错误格式化，
 * 避免每个 handler 重复编写错误处理逻辑。
 */

import { ZodError } from 'zod'
import { createLogger } from '../core/logger'

const logger = createLogger('ipc')

/**
 * 包装 IPC handler，添加统一的 try/catch 错误处理
 *
 * - ZodError → 返回 `{ error: 'Invalid input: ...' }`
 * - 其他 Error → 记录日志 + 返回 `{ error: '...' }`
 * - 未知异常 → 记录日志 + 返回通用错误消息
 *
 * @param handler - 原始 handler 函数
 * @param channel - IPC 通道名（用于日志）
 * @returns 包装后的 handler 函数
 */
export function wrapIpcHandler<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult> | TResult,
  channel: string
): (...args: TArgs) => Promise<TResult | { error: string }> {
  return async (...args: TArgs): Promise<TResult | { error: string }> => {
    try {
      return await handler(...args)
    } catch (e) {
      if (e instanceof ZodError) {
        const issues = e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        return { error: `Invalid input: ${issues}` }
      }
      const message = e instanceof Error ? e.message : String(e)
      logger.error(`IPC handler failed: ${channel}`, { error: message })
      return { error: message }
    }
  }
}
