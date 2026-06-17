/**
 * 调试日志统一路径助手
 *
 * 所有诊断/调试类日志（如 update.log / proxy-debug.log / auth-debug.log）统一走本模块
 * 拼接文件路径，规则一致、仅文件名不同：
 * - dev：项目根目录（app.getAppPath()，与历史 llm-gateway-*-debug.log 同位置，便于就近排查）
 * - 正式包：安装目录下的 logs/ 子目录
 *
 * 说明：NSIS 默认 perUser 安装到 %LOCALAPPDATA%/Programs/<appName>，该目录用户可写，
 * 故安装目录 logs 方案可行；若未来改为 perMachine 安装到 Program Files，需迁移到 userData。
 */
import { app } from 'electron'
import * as path from 'path'

/**
 * 获取调试日志所在目录。
 * @returns dev 返回项目根目录；正式包返回安装目录下的 logs/；非 electron 运行时返回 null
 */
export function getDebugLogDir(): string | null {
  // 防御：非 electron 运行时（纯 node / vitest）app 为 undefined，此时不落盘文件
  if (!app || typeof app.isPackaged !== 'boolean') return null
  // app.getPath('exe') 在正式包指向可执行文件本体，其父目录即安装根
  return app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'logs')
    : app.getAppPath()
}

/**
 * 拼接调试日志文件完整路径。
 * @param filename - 日志文件名（如 'update.log'、'proxy-debug.log'）
 * @returns 完整绝对路径；非 electron 运行时返回 undefined（调用方 createLogger 据此跳过 file transport）
 * @example
 * getDebugLogPath('update.log')        // dev: E:\code\llm-gateway\update.log
 * getDebugLogPath('proxy-debug.log')   // 正式包: C:\...\Programs\app\logs\proxy-debug.log
 */
export function getDebugLogPath(filename: string): string | undefined {
  const dir = getDebugLogDir()
  return dir ? path.join(dir, filename) : undefined
}
