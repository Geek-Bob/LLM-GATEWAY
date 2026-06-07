/**
 * NDJSON 日志写入层
 *
 * 负责日志文件的创建、追加写入、轮转和元数据管理。
 * 日志以 NDJSON 格式存储，每个文件最多 MAX_LINES 行，最多保留 MAX_FILES 个文件。
 */

import fs from 'fs'
import path from 'path'
import { createLogger } from '../core/logger'

const logger = createLogger('logs-writer')
import type { LogDebugInfo } from '../../shared/types'

const MAX_LINES = 500
const MAX_FILES = 20

/** 日志系统元数据结构 */
interface LogsMeta {
  entryCounter: number
  currentFileNumber: number
  currentFileLines: number
}

let logsDir: string | null = null
let currentFileNumber = 0
let currentFileLines = 0
let entryCounter = 0

/** 获取单文件最大行数常量（供 reader 模块推算已满文件行数用） */
export function getMaxLines(): number {
  return MAX_LINES
}

/** 获取当前日志文件行数（供 reader 模块查询分页用） */
export function getCurrentFileLines(): number {
  return currentFileLines
}

/** 获取当前全局日志条目计数（供 reader 模块计算 total 用） */
export function getEntryCounter(): number {
  return entryCounter
}

/** 获取元数据文件路径 */
function getMetaPath(): string {
  return path.join(logsDir!, 'logs-meta.json')
}

/** 从元数据文件恢复计数器状态 */
function loadMeta(): LogsMeta {
  try {
    if (fs.existsSync(getMetaPath())) {
      const data = fs.readFileSync(getMetaPath(), 'utf-8')
      return JSON.parse(data) as LogsMeta
    }
  } catch (error) {
    logger.debug('Failed to load logs meta', { error })
  }
  return { entryCounter: 0, currentFileNumber: 0, currentFileLines: 0 }
}

/** 将当前计数器状态持久化到元数据文件 */
function saveMeta(): void {
  try {
    fs.writeFileSync(
      getMetaPath(),
      JSON.stringify({ entryCounter, currentFileNumber, currentFileLines }),
      'utf-8'
    )
  } catch (error) {
    logger.debug('Failed to save logs meta', { error })
  }
}

export interface LogEntryProps {
  apiKeyId?: number
  providerId?: number
  model: string
  apiFormat: 'anthropic' | 'openai'
  statusCode?: number
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  error?: string
  debug?: LogDebugInfo
}

/** 获取日志目录下所有符合命名规则的 NDJSON 文件列表（已排序）。 */
export function getFileList(): string[] {
  if (!logsDir) return []
  try {
    return fs
      .readdirSync(logsDir)
      .filter((f) => /^logs-\d{4}\.ndjson$/.test(f))
      .sort()
      .map((f) => path.join(logsDir!, f))
  } catch (error) {
    logger.debug('Failed to list log files', { error })
    return []
  }
}

/** 从文件名 "logs-0001.ndjson" 中提取数字部分（0001 → 1）。 */
function extractFileNumber(filePath: string): number {
  const match = path.basename(filePath).match(/^logs-(\d{4})\.ndjson$/)
  return match ? parseInt(match[1], 10) : 0
}

/** 统计文件行数，用于判断是否达到 MAX_LINES 轮转阈值。使用流式读取避免大文件 OOM。 */
function countLines(filePath: string): number {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size === 0) return 0
    // 小文件（<10MB）直接读取，大文件用 buf 逐块计数
    if (stat.size < 10 * 1024 * 1024) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content ? content.trimEnd().split('\n').length : 0
    }
    const fd = fs.openSync(filePath, 'r')
    // 64KB buffer，平衡内存占用与读取效率
    const buf = Buffer.alloc(64 * 1024)
    let lines = 0
    let bytesRead: number
    let lastByte = 0
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 10) lines++ // '\n'
        lastByte = buf[i]
      }
    }
    fs.closeSync(fd)
    // 最后一行没有换行符时也要计数
    if (lastByte !== 10 && stat.size > 0) lines++
    return lines
  } catch (error) {
    logger.debug('Failed to count lines', { error })
    return 0
  }
}

/** 根据序号生成 NDJSON 文件路径。 */
function filePathFromNum(n: number): string {
  return path.join(
    logsDir!,
    `logs-${String(n).padStart(4, '0')}.ndjson`
  )
}

/** 确保指定序号的日志文件存在（空文件创建），避免后续 append 失败。 */
function ensureFile(n: number): void {
  const fp = filePathFromNum(n)
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '', 'utf-8')
  }
}

/**
 * 轮转日志文件：当前文件写满后，创建新序号文件。
 * 如果文件总数已达 MAX_FILES，先删除最旧的文件再创建新文件。
 * 此策略保证磁盘占用上限可控（最多 MAX_FILES 个文件 × MAX_LINES 行）。
 */
function rollFile(): void {
  const files = getFileList()
  if (files.length >= MAX_FILES) {
    fs.unlinkSync(files[0])
  }
  const existing = getFileList()
  const maxNum = existing.reduce(
    (max, f) => Math.max(max, extractFileNumber(f)),
    0
  )
  currentFileNumber = maxNum + 1
  currentFileLines = 0
  ensureFile(currentFileNumber)
  saveMeta()
}

/** 初始化日志目录。优先从元数据文件恢复计数器状态，避免全量扫描 NDJSON 文件。 */
export function initLogsDir(dir: string): void {
  logsDir = dir
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 优先从元数据文件恢复状态
  const meta = loadMeta()
  if (meta.entryCounter > 0 || meta.currentFileNumber > 0) {
    currentFileNumber = meta.currentFileNumber
    entryCounter = meta.entryCounter
    currentFileLines = meta.currentFileLines
    return
  }

  // 回退：元数据文件不存在时（首次运行/旧版本升级），全量扫描现有文件
  const files = getFileList()
  if (files.length > 0) {
    const lastFile = files[files.length - 1]
    currentFileNumber = extractFileNumber(lastFile)
    currentFileLines = countLines(lastFile)
    entryCounter = files.reduce((sum, f) => sum + countLines(f), 0)
    // 扫描完成后立即写入元数据，下次启动直接使用
    saveMeta()
  } else {
    currentFileNumber = 0
    currentFileLines = 0
    entryCounter = 0
  }
}

/**
 * 写入一条日志条目到当前 NDJSON 文件。
 * 数据格式要点：
 * - ID 是全局自增的（跨文件），便于全局唯一标识每条请求
 * - 字段名采用 snake_case 以匹配 SQL 风格和前端展示
 * - debug 字段是可选的对象，仅需要时附加（如请求/响应体快照）
 * - 不记录 API Key 明文（安全要求）
 */
export function createLogEntry(entry: LogEntryProps): void {
  if (!logsDir) throw new Error('Logs directory not initialized')

  if (currentFileLines >= MAX_LINES) {
    rollFile()
  }

  // 首次写入：初始化第一个文件（序号从 1 开始）
  if (currentFileLines === 0 && currentFileNumber === 0) {
    currentFileNumber = 1
    ensureFile(currentFileNumber)
  }

  const fp = filePathFromNum(currentFileNumber)
  entryCounter++
  const line =
    JSON.stringify({
      id: entryCounter,
      api_key_id: entry.apiKeyId,
      provider_id: entry.providerId,
      model: entry.model,
      api_format: entry.apiFormat,
      status_code: entry.statusCode,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      duration_ms: entry.durationMs,
      error: entry.error,
      created_at: new Date().toISOString(),
      debug: entry.debug
    }) + '\n'

  fs.appendFileSync(fp, line, 'utf-8')
  currentFileLines++
  // 每次写入后持久化元数据（~60 字节），避免启动时全量扫描 NDJSON 文件
  saveMeta()
}

/** 删除超出 MAX_FILES 数量的最旧日志文件，在轮转时同步调用。 */
export function cleanupOldLogs(): void {
  const files = getFileList()
  while (files.length > MAX_FILES) {
    fs.unlinkSync(files[0])
    files.shift()
  }
}
