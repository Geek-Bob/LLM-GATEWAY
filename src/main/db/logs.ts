/**
 * NDJSON 日志系统 + SQLite 预聚合统计
 *
 * 日志存储采用双层架构：
 * 1. 详细日志：以 NDJSON（每行一个 JSON 对象）格式写入文件系统，
 *    每个文件最多 10000 行（MAX_LINES），最多保留 10 个文件（MAX_FILES），
 *    超出时自动轮转删除最旧文件。文件名格式 logs-{四位数序号}.ndjson。
 * 2. 预聚合统计：同时将请求指标写入 SQLite 的 request_stats 和
 *    request_stats_provider 表，用于仪表盘快速查询，避免全量扫描 NDJSON。
 *
 * 关键限制：
 * - NDJSON 文件不是数据库，不支持随机写，只能 append
 * - 查询时必须全量读取再过滤，适合小规模本地日志场景
 * - 不在 NDJSON 中存储 API Key 明文（安全要求）
 */

import fs from 'fs'
import path from 'path'
import { getDb } from './connection'
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
  } catch {
    // 文件损坏时忽略
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
  } catch {
    // 写入失败时静默忽略（不影响日志记录功能）
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

export interface LogQuery {
  page: number
  limit: number
  providerId?: number
  dateFrom?: string
  dateTo?: string
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

/** 获取日志目录下所有符合命名规则的 NDJSON 文件列表（已排序）。 */
function getFileList(): string[] {
  if (!logsDir) return []
  try {
    return fs
      .readdirSync(logsDir)
      .filter((f) => /^logs-\d{4}\.ndjson$/.test(f))
      .sort()
      .map((f) => path.join(logsDir!, f))
  } catch {
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
  } catch {
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

/**
 * 将一条原始 NDJSON 行解析为统一格式的对象。
 * 兼容两种字段命名风格（camelCase 和 snake_case），
 * 便于处理可能来自不同版本的文件格式。
 */
function normalizeEntry(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw.id ?? 0,
    api_key_id: raw.apiKeyId ?? raw.api_key_id ?? null,
    provider_id: raw.providerId ?? raw.provider_id ?? null,
    model: raw.model ?? '',
    api_format: raw.apiFormat ?? raw.api_format ?? '',
    status_code: raw.statusCode ?? raw.status_code ?? 0,
    tokens_in: raw.tokensIn ?? raw.tokens_in ?? 0,
    tokens_out: raw.tokensOut ?? raw.tokens_out ?? 0,
    duration_ms: raw.durationMs ?? raw.duration_ms ?? 0,
    error: raw.error ?? null,
    created_at: raw.createdAt ?? raw.created_at ?? '',
    debug: raw.debug ?? undefined,
  }
}

/**
 * 从文件末尾反向读取指定行数，避免加载整个文件到内存。
 *
 * 实现原理：
 * 1. 从文件末尾开始，按 64KB 块反向读取
 * 2. 在块边界处正确处理跨块的行
 * 3. 收集够所需行数后立即停止
 *
 * 时间复杂度：O(读取的行数)，与文件总大小无关
 * 空间复杂度：O(读取的行数)
 */
function readTailLines(filePath: string, maxLines: number): string[] {
  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  if (fileSize === 0) return []

  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 64 * 1024 // 64KB
  const lines: string[] = []
  let position = fileSize
  let leftover = ''

  try {
    while (position > 0 && lines.length < maxLines) {
      const readSize = Math.min(chunkSize, position)
      position -= readSize
      const chunk = Buffer.alloc(readSize)
      fs.readSync(fd, chunk, 0, readSize, position)

      const str = chunk.toString('utf-8') + leftover
      const parts = str.split('\n')

      // 第一块可能不完整（不是从行首开始），保留为 leftover
      leftover = position > 0 ? parts[0] : ''

      // 从末尾向前处理完整的行
      // position > 0 时 parts[0] 是不完整的行（已存入 leftover），从 parts[1] 开始
      // position === 0 时 parts[0] 是完整的行，从 parts[0] 开始
      const endIdx = parts.length - 1
      const startIdx = position > 0 ? 1 : 0
      for (let i = endIdx; i >= startIdx; i--) {
        if (lines.length >= maxLines) break
        const part = parts[i]
        if (!part) continue
        const line = part.trim()
        if (line) {
          lines.push(line)
        }
      }
    }

    // 处理文件开头的剩余内容
    if (leftover.trim() && lines.length < maxLines) {
      lines.push(leftover.trim())
    }
  } finally {
    fs.closeSync(fd)
  }

  return lines
}

/**
 * 流式统计文件中匹配过滤条件的总行数，不将整个文件加载到内存。
 * 用于有过滤条件时计算 total，无过滤条件时直接使用 entryCounter。
 */
function countMatchingEntries(
  filePath: string,
  predicate: (entry: Record<string, unknown>) => boolean
): number {
  const stat = fs.statSync(filePath)
  if (stat.size === 0) return 0

  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 256 * 1024 // 256KB
  const buf = Buffer.alloc(chunkSize)
  let count = 0
  let leftover = ''
  let bytesRead: number

  try {
    while ((bytesRead = fs.readSync(fd, buf, 0, chunkSize, null)) > 0) {
      const str = leftover + buf.toString('utf-8', 0, bytesRead)
      const parts = str.split('\n')
      // 最后一块可能不完整，保留为 leftover
      leftover = parts.pop()!
      for (const part of parts) {
        const line = part.trim()
        if (!line) continue
        try {
          const entry = normalizeEntry(JSON.parse(line))
          if (predicate(entry)) count++
        } catch {
          // 忽略格式异常的行
        }
      }
    }
    // 处理文件末尾没有换行符的内容
    if (leftover.trim()) {
      try {
        const entry = normalizeEntry(JSON.parse(leftover.trim()))
        if (predicate(entry)) count++
      } catch {
        // 忽略
      }
    }
  } finally {
    fs.closeSync(fd)
  }

  return count
}

/**
 * 计算每个文件的实际行数（从文件列表和元数据推导）。
 * 最新文件行数 = currentFileLines，其余文件满额 = MAX_LINES。
 * 返回数组与 files 下标对应。
 */
function getFileLineCounts(files: string[]): number[] {
  const counts: number[] = []
  for (let i = 0; i < files.length; i++) {
    // 最后一个文件（最新）使用 currentFileLines，其余满额
    counts.push(i === files.length - 1 ? currentFileLines : MAX_LINES)
  }
  return counts
}

/**
 * 根据全局偏移量（从末尾计数）定位到具体文件和文件内偏移。
 * 返回 { fileIndex, offsetInFile }，fileIndex 为 files 数组下标。
 */
function locatePosition(
  files: string[],
  lineCounts: number[],
  skipFromEnd: number
): { fileIndex: number; offsetInFile: number } {
  let remaining = skipFromEnd
  // 从最新文件（末尾）开始定位
  for (let i = files.length - 1; i >= 0; i--) {
    if (remaining < lineCounts[i]) {
      return { fileIndex: i, offsetInFile: remaining }
    }
    remaining -= lineCounts[i]
  }
  // 超出范围，返回最旧文件的开头
  return { fileIndex: 0, offsetInFile: 0 }
}

/**
 * 从指定文件的指定行开始读取（从文件开头正向定位）。
 * skipFromStart: 从文件开头跳过的行数（0 = 第一行）
 * count: 需要读取的行数
 * 返回的行已按文件内顺序（旧在前，新在后）。
 *
 * 实现：用 fs.readSync 逐块读取，跳过 skipFromStart 行后读取 count 行。
 * 内存：O(count)，与文件总行数无关。
 */
function readLinesFromStart(
  filePath: string,
  skipFromStart: number,
  count: number
): string[] {
  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 64 * 1024
  const buf = Buffer.alloc(chunkSize)
  let bytesRead: number
  let position = 0
  let lineIndex = 0
  let partial = ''
  const result: string[] = []

  try {
    while ((bytesRead = fs.readSync(fd, buf, 0, chunkSize, position)) > 0) {
      position += bytesRead
      const text = partial + buf.toString('utf-8', 0, bytesRead)
      const parts = text.split('\n')
      // 最后一部分可能不完整，留到下次
      partial = parts.pop() ?? ''

      for (const part of parts) {
        if (lineIndex >= skipFromStart) {
          const line = part.trim()
          if (line) result.push(line)
          if (result.length >= count) return result
        }
        lineIndex++
      }
    }
    // 处理文件末尾没有换行符的情况
    if (partial.trim() && lineIndex >= skipFromStart && result.length < count) {
      result.push(partial.trim())
    }
  } finally {
    fs.closeSync(fd)
  }
  return result
}

/**
 * 从指定文件读取指定范围的行（从末尾计数）。
 * startFromEnd: 从末尾算起的起始偏移（0 = 最后一行）
 * count: 需要读取的行数
 * totalLines: 该文件的已知行数（由调用方从 lineCounts 传入，避免重复扫描）
 * 返回的行已按时间倒序（最新在前）。
 *
 * 转换逻辑：offsetFromEnd → skipFromStart = totalLines - offsetFromEnd - count
 */
function readRangeFromFile(
  filePath: string,
  startFromEnd: number,
  count: number,
  totalLines: number
): string[] {
  const skipFromStart = Math.max(0, totalLines - startFromEnd - count)
  // 当 skipFromStart 被 clamp 时，实际可读行数可能少于 count
  const effectiveCount = Math.min(count, totalLines - startFromEnd - skipFromStart)
  const lines = readLinesFromStart(filePath, skipFromStart, effectiveCount)
  return lines.reverse()
}

/**
 * 查询日志条目，支持分页和过滤。
 *
 * 查询策略（文件级定位版）：
 * 1. 无过滤条件：
 *    - total 直接使用 entryCounter（元数据）
 *    - 根据 skip 计算目标文件，只读取当前页所在文件
 *    - 复杂度：O(limit)，与文件总大小无关
 * 2. 有过滤条件：
 *    - 从最新文件流式扫描统计匹配总数
 *    - 从最新文件反向读取，收集够当前页就停
 */
export function queryLogs(
  query: LogQuery
): { logs: Record<string, unknown>[]; total: number } {
  const files = getFileList()
  if (files.length === 0) return { logs: [], total: 0 }

  const hasFilter = query.providerId !== undefined || !!query.dateFrom || !!query.dateTo
  const skip = (query.page - 1) * query.limit

  // 构建过滤谓词
  const predicate = (e: Record<string, unknown>): boolean => {
    if (query.providerId !== undefined && e.provider_id !== query.providerId) return false
    if (query.dateFrom) {
      const d = e.created_at as string | undefined
      if (!d || d < query.dateFrom) return false
    }
    if (query.dateTo) {
      const d = e.created_at as string | undefined
      if (!d || d > query.dateTo) return false
    }
    return true
  }

  let totalCount: number
  let logs: Record<string, unknown>[]

  if (!hasFilter) {
    // === 无过滤条件：文件级定位，只读当前页所在文件 ===
    totalCount = entryCounter
    if (skip >= totalCount) {
      return { logs: [], total: totalCount }
    }
    const lineCounts = getFileLineCounts(files)
    const start = locatePosition(files, lineCounts, skip)
    const end = locatePosition(files, lineCounts, skip + query.limit)

    if (start.fileIndex === end.fileIndex) {
      // 当前页在同一文件内，只读这一个文件
      const rawLines = readRangeFromFile(files[start.fileIndex], start.offsetInFile, query.limit, lineCounts[start.fileIndex])
      logs = rawLines.map((line) => {
        try { return normalizeEntry(JSON.parse(line)) } catch { return null }
      }).filter((e): e is Record<string, unknown> => e !== null)
    } else {
      // 当前页跨文件：从 start 文件读一部分，从 end 文件读一部分
      const collected: Record<string, unknown>[] = []

      // 从 start 文件（较新）读取尾部
      const startLines = readRangeFromFile(files[start.fileIndex], start.offsetInFile, lineCounts[start.fileIndex] - start.offsetInFile, lineCounts[start.fileIndex])
      for (const line of startLines) {
        try { collected.push(normalizeEntry(JSON.parse(line))) } catch { /* skip */ }
      }

      // 从 end 文件（较旧）读取头部
      const endLines = readRangeFromFile(files[end.fileIndex], 0, query.limit - collected.length, lineCounts[end.fileIndex])
      for (const line of endLines) {
        try { collected.push(normalizeEntry(JSON.parse(line))) } catch { /* skip */ }
      }

      logs = collected
    }
  } else {
    // === 有过滤条件：流式扫描 + 反向读取 ===
    totalCount = 0
    const collected: Record<string, unknown>[] = []
    const needLines = skip + query.limit

    for (let i = files.length - 1; i >= 0; i--) {
      const fp = files[i]
      totalCount += countMatchingEntries(fp, predicate)

      // 从文件末尾反向读取，多读一些以应对过滤淘汰
      const readLimit = Math.min(needLines * 10, 5000)
      const rawLines = readTailLines(fp, readLimit)

      for (const line of rawLines) {
        try {
          const entry = normalizeEntry(JSON.parse(line))
          if (predicate(entry)) {
            collected.push(entry)
            if (collected.length >= needLines) break
          }
        } catch {
          // 忽略格式异常的行
        }
      }

      if (collected.length >= needLines) break
    }

    logs = collected.slice(skip, skip + query.limit)
  }

  return { logs, total: totalCount }
}

// --- 预聚合统计（写入 SQLite request_stats / request_stats_provider 表） ---
// 原理：每次请求结束时写入一行"增量"，通过 ON CONFLICT ... DO UPDATE 合并。
// 按小时粒度聚合，支持 24h / 7d / 30d 范围的聚合查询。
// 避免每次查询时全量扫描 NDJSON 文件。

/** 写入全局请求统计（按日期+小时聚合，含错误计数）。 */
export function updateRequestStats(
  entry: {
    tokensIn?: number
    tokensOut?: number
    durationMs?: number
    statusCode?: number
  }
): void {
  const db = getDb()
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hour = now.getHours()
  const tokensIn = entry.tokensIn ?? 0
  const tokensOut = entry.tokensOut ?? 0
  const durationMs = entry.durationMs ?? 0
  // 状态码 >= 400 计为一次错误
  const errorCount =
    entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

  db.prepare(
    `INSERT INTO request_stats (stat_date, stat_hour, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
     VALUES (@date, @hour, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
     ON CONFLICT(stat_date, stat_hour) DO UPDATE SET
       total_requests = total_requests + 1,
       total_tokens_in = total_tokens_in + @tokensIn,
       total_tokens_out = total_tokens_out + @tokensOut,
       total_errors = total_errors + @errorCount,
       total_duration_ms = total_duration_ms + @durationMs`
  ).run({
    date: dateStr,
    hour,
    tokensIn,
    tokensOut,
    errorCount,
    durationMs
  })
}

/** 写入按供应商+模型维度的统计。若缺少 providerId 则跳过（如匿名请求）。 */
export function updateProviderStats(entry: {
  providerId?: number
  model: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  statusCode?: number
}): void {
  const db = getDb()
  if (entry.providerId === undefined) return // 没有供应商上下文时跳过
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hour = now.getHours()
  const tokensIn = entry.tokensIn ?? 0
  const tokensOut = entry.tokensOut ?? 0
  const durationMs = entry.durationMs ?? 0
  const errorCount = entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

  db.prepare(
    `INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
     VALUES (@date, @hour, @providerId, @model, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
     ON CONFLICT(stat_date, stat_hour, provider_id, model) DO UPDATE SET
       total_requests = total_requests + 1,
       total_tokens_in = total_tokens_in + @tokensIn,
       total_tokens_out = total_tokens_out + @tokensOut,
       total_errors = total_errors + @errorCount,
       total_duration_ms = total_duration_ms + @durationMs`
  ).run({
    date: dateStr,
    hour,
    providerId: entry.providerId,
    model: entry.model,
    tokensIn,
    tokensOut,
    errorCount,
    durationMs
  })
}

/** 获取指定时间范围的全局统计汇总，含平均延迟计算。range 支持 24h / 7d / 30d，默认 7d。 */
export function getLogStats(opts: {
  range: string
}): Record<string, unknown> {
  const db = getDb()
  let dateCondition: string
  switch (opts.range) {
    case '24h':
      dateCondition = "stat_date = date('now')"
      break
    case '7d':
      dateCondition = "stat_date >= date('now', '-7 days')"
      break
    case '30d':
      dateCondition = "stat_date >= date('now', '-30 days')"
      break
    default:
      dateCondition = "stat_date >= date('now', '-7 days')"
  }

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(total_requests), 0) as total_requests,
        COALESCE(SUM(total_tokens_in), 0) as total_tokens_in,
        COALESCE(SUM(total_tokens_out), 0) as total_tokens_out,
        CASE WHEN SUM(total_requests) > 0
          THEN SUM(total_duration_ms) * 1.0 / SUM(total_requests)
          ELSE 0 END as avg_duration_ms,
        COALESCE(SUM(total_errors), 0) as total_errors
      FROM request_stats
      WHERE ${dateCondition}`
    )
    .get() as Record<string, unknown> | undefined

  return row ?? { total_requests: 0, total_tokens_in: 0, total_tokens_out: 0, avg_duration_ms: 0, total_errors: 0 }
}

/**
 * 获取按供应商/模型维度的详细统计。
 * - range='24h'：按小时分组，返回当天每个小时的数据
 * - range='30d'：按天分组，返回过去 30 天每天的数据
 * 返回值中的 period 字段根据 range 不同对应 stat_hour 或 stat_date。
 */
export function getDetailedStats(range: '24h' | '30d'): Record<string, unknown>[] {
  const db = getDb()
  let dateCondition: string
  let groupBy: string

  if (range === '24h') {
    dateCondition = "stat_date = date('now')"
    groupBy = 'stat_hour'
  } else {
    dateCondition = "stat_date >= date('now', '-30 days')"
    groupBy = 'stat_date'
  }

  const rows = db
    .prepare(
      `SELECT
        provider_id,
        model,
        ${groupBy === 'stat_hour' ? 'stat_hour' : 'stat_date'} as period,
        SUM(total_requests) as total_requests,
        SUM(total_tokens_in) as total_tokens_in,
        SUM(total_tokens_out) as total_tokens_out,
        SUM(total_errors) as total_errors
      FROM request_stats_provider
      WHERE ${dateCondition}
      GROUP BY provider_id, model, ${groupBy}
      ORDER BY provider_id, model, ${groupBy}`
    )
    .all() as Record<string, unknown>[]

  return rows
}

/** 删除超出 MAX_FILES 数量的最旧日志文件，在轮转时同步调用。 */
export function cleanupOldLogs(): void {
  const files = getFileList()
  while (files.length > MAX_FILES) {
    fs.unlinkSync(files[0])
    files.shift()
  }
}
