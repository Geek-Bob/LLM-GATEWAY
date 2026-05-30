type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

export function createLogger(moduleName: string): Logger {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level.toUpperCase()}] [${moduleName}]`
    const payload = data ? ` ${JSON.stringify(data)}` : ''
    const line = `${prefix} ${message}${payload}`

    switch (level) {
      case 'error': console.error(line); break
      case 'warn': console.warn(line); break
      case 'debug': console.debug(line); break
      default: console.log(line); break
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  }
}
