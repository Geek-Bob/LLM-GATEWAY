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
 * 错误分类（基于消息前缀，遵循 backend/34-error-handling.md）：
 * - ZodError → `{ error: 'Invalid input: {field}: {message}' }`
 * - 业务错误（消息以 `Failed to ` 开头）→ 原样返回给渲染进程，记录 warn
 * - 系统错误（其他 Error / 非 Error 异常）→ 记录详细 stack，对外返回通用消息
 *   `Failed to {channel}: internal error`，避免泄漏 SQLite/堆栈细节
 *
 * @param handler - 原始 handler 函数
 * @param channel - IPC 通道名（用于日志和系统错误消息）
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
      // 业务错误：service 层抛出的、面向用户的可见错误，原样返回
      if (message.startsWith('Failed to ')) {
        logger.warn('IPC handler business error', { channel, error: message })
        return { error: message }
      }
      // 系统错误：记录详情用于排查，对外返回通用消息以避免泄漏堆栈
      logger.error('IPC handler system error', {
        channel,
        error: message,
        stack: e instanceof Error ? e.stack : undefined,
      })
      return { error: `Failed to ${channel}: internal error` }
    }
  }
}
