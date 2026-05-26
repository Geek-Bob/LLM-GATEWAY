import fs from 'fs'
import path from 'path'
import { getDb } from './connection'
import type { LogDebugInfo } from '../../shared/types'

const MAX_LINES = 10000
const MAX_FILES = 10

let logsDir: string | null = null
let currentFileNumber = 0
let currentFileLines = 0
let entryCounter = 0

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

/** Initialize the logs directory. Scans existing files to resume state. */
export function initLogsDir(dir: string): void {
  logsDir = dir
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const files = getFileList()
  if (files.length > 0) {
    const lastFile = files[files.length - 1]
    currentFileNumber = extractFileNumber(lastFile)
    currentFileLines = countLines(lastFile)
    // Count total entries across all files for the ID counter
    entryCounter = files.reduce((sum, f) => sum + countLines(f), 0)
  } else {
    currentFileNumber = 0
    currentFileLines = 0
    entryCounter = 0
  }
}

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

function extractFileNumber(filePath: string): number {
  const match = path.basename(filePath).match(/^logs-(\d{4})\.ndjson$/)
  return match ? parseInt(match[1], 10) : 0
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content ? content.trimEnd().split('\n').length : 0
  } catch {
    return 0
  }
}

function filePathFromNum(n: number): string {
  return path.join(
    logsDir!,
    `logs-${String(n).padStart(4, '0')}.ndjson`
  )
}

function ensureFile(n: number): void {
  const fp = filePathFromNum(n)
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '', 'utf-8')
  }
}

function rollFile(): void {
  const files = getFileList()
  // Delete oldest if at max
  if (files.length >= MAX_FILES) {
    fs.unlinkSync(files[0])
  }
  // Find the next file number
  const existing = getFileList()
  const maxNum = existing.reduce(
    (max, f) => Math.max(max, extractFileNumber(f)),
    0
  )
  currentFileNumber = maxNum + 1
  currentFileLines = 0
  ensureFile(currentFileNumber)
}

export function createLogEntry(entry: LogEntryProps): void {
  if (!logsDir) throw new Error('Logs directory not initialized')

  if (currentFileLines >= MAX_LINES) {
    rollFile()
  }

  // First write: ensure file exists
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
}

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
          return null
        }
      })
      .filter((e): e is Record<string, unknown> => e !== null)
  } catch {
    return []
  }
}

export function queryLogs(
  query: LogQuery
): { logs: Record<string, unknown>[]; total: number } {
  const files = getFileList()
  if (files.length === 0) return { logs: [], total: 0 }

  // Read all files from newest to oldest, collecting entries in reverse chronological order
  const allEntries: Record<string, unknown>[] = []
  for (let i = files.length - 1; i >= 0; i--) {
    const fp = files[i]
    const fileLines = readFileEntries(fp)
    // Each file is chronological (oldest first), reverse so newest-first
    for (let j = fileLines.length - 1; j >= 0; j--) {
      allEntries.push(fileLines[j])
    }
  }

  // Apply filters
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

  // Pagination (skip/limit on already newest-first data)
  const total = filtered.length
  const skip = (query.page - 1) * query.limit
  const logs = filtered.slice(skip, skip + query.limit)

  return { logs, total }
}

// --- Pre-computed stats (stored in sql.js request_stats table) ---

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

export function updateProviderStats(entry: {
  providerId?: number
  model: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  statusCode?: number
}): void {
  const db = getDb()
  if (entry.providerId === undefined) return // skip if no provider context
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

/** Delete oldest NDJSON files to maintain max file count. */
export function cleanupOldLogs(): void {
  const files = getFileList()
  while (files.length > MAX_FILES) {
    fs.unlinkSync(files[0])
    files.shift()
  }
}
