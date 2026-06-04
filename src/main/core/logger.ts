/**
 * 统一日志模块
 *
 * 提供带时间戳和模块名的结构化日志输出，支持 debug/info/warn/error 四个级别。
 * 可选 file transport 支持写入日志文件（异步追加，不阻塞主线程）。
 * 所有主进程模块应通过 createLogger() 创建自己的日志实例，禁止直接使用 console.log。
 */

import * as fs from 'fs'
import * as path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 日志器接口，提供四个日志级别方法
 * data 参数用于附加结构化上下文（如请求 ID、错误详情），输出时自动 JSON 序列化
 */
interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

/** file transport 配置 */
export interface FileTransportOptions {
  /** 日志文件绝对路径 */
  file: string
  /** 启动时清空日志文件（避免日志文件无限增长） */
  truncate?: boolean
}

/**
 * 脱敏 data 中的 authorization 字段
 * 避免 API Key 泄漏到日志文件
 */
function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (
      key === 'authorization' &&
      typeof value === 'string'
    ) {
      // 截断为前缀，隐藏完整密钥
      result[key] = value.length > 20 ? value.slice(0, 20) + '...' : value
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitize(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * 创建模块化日志实例
 * @param moduleName - 模块名称，出现在每条日志的 [MODULE] 前缀中
 * @param opts - 可选配置：file transport 路径
 */
export function createLogger(moduleName: string, opts?: FileTransportOptions): Logger {
  // 确保日志文件所在目录存在
  if (opts?.file) {
    const dir = path.dirname(opts.file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    // 启动时清空日志文件，避免无限增长
    if (opts.truncate) {
      try { fs.writeFileSync(opts.file, '', 'utf-8') } catch { /* 静默忽略 */ }
    }
  }

  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level.toUpperCase()}] [${moduleName}]`
    const payload = data ? ` ${JSON.stringify(data)}` : ''
    const line = `${prefix} ${message}${payload}`

    // 控制台输出
    switch (level) {
      case 'error': console.error(line); break
      case 'warn': console.warn(line); break
      case 'debug': console.debug(line); break
      default: console.log(line); break
    }

    // file transport（异步追加，不阻塞主线程）
    if (opts?.file) {
      const sanitizedData = data ? sanitize(data) : undefined
      const sanitizedPayload = sanitizedData ? ` ${JSON.stringify(sanitizedData)}` : ''
      const sanitizedLine = `${prefix} ${message}${sanitizedPayload}`
      fs.appendFile(opts.file, sanitizedLine + '\n', (err) => {
        // 文件写入失败静默忽略，避免日志系统自身崩溃影响业务
        if (err) {
          console.error(`[LOGGER] Failed to write to ${opts.file}: ${err.message}`)
        }
      })
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  }
}
