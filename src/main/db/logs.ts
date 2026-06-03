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

const MAX_LINES = 10000
const MAX_FILES = 10

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

/** 统计文件行数，用于判断是否达到 MAX_LINES 轮转阈值。 */
function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content ? content.trimEnd().split('\n').length : 0
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

/** 读取单个 NDJSON 文件的所有条目，过滤掉解析失败的损坏行。 */
function readFileEntries(fp: string): Record<string, unknown>[] {
  try {
    const content = fs.readFileSync(fp, 'utf-8')
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeEntry(JSON.parse(line))
        } catch {
          return null // 忽略格式异常的行
        }
      })
      .filter((e): e is Record<string, unknown> => e !== null)
  } catch {
    return []
  }
}

/**
 * 查询日志条目，支持分页和过滤。
 *
 * 查询策略：
 * - 从最新文件到最旧文件读取，每个文件内部反转（文件内是正序），
 *   最终得到全局最新优先的数组
 * - 在内存中进行过滤和分页
 * - 此方案仅适用于日志量较小的桌面应用场景
 *   （~10 万条以内），大数据量场景需替换为数据库方案
 */
export function queryLogs(
  query: LogQuery
): { logs: Record<string, unknown>[]; total: number } {
  const files = getFileList()
  if (files.length === 0) return { logs: [], total: 0 }

  // 从最新文件往最旧读，每条文件内部再反转，保证整体按时间倒序
  const allEntries: Record<string, unknown>[] = []
  for (let i = files.length - 1; i >= 0; i--) {
    const fp = files[i]
    const fileLines = readFileEntries(fp)
    for (let j = fileLines.length - 1; j >= 0; j--) {
      allEntries.push(fileLines[j])
    }
  }

  // 过滤条件支持：供应商、日期范围（基于 ISO 字符串字典序比较）
  let filtered = allEntries
  if (query.providerId !== undefined) {
    filtered = filtered.filter((e) => e.provider_id === query.providerId)
  }
  if (query.dateFrom) {
    filtered = filtered.filter((e) => {
      const d = e.created_at as string | undefined
      return d !== undefined && d >= query.dateFrom!
    })
  }
  if (query.dateTo) {
    filtered = filtered.filter((e) => {
      const d = e.created_at as string | undefined
      return d !== undefined && d <= query.dateTo!
    })
  }

  // 分页：基于过滤后已按时间倒序的数据
  const total = filtered.length
  const skip = (query.page - 1) * query.limit
  const logs = filtered.slice(skip, skip + query.limit)

  return { logs, total }
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
