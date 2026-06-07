/**
 * NDJSON 日志查询层
 *
 * 负责从 NDJSON 文件中读取、过滤和分页查询日志条目。
 * 使用文件级定位策略，无过滤条件时只读当前页所在文件，避免全量扫描。
 */

import fs from 'fs'
import { getFileList, getCurrentFileLines, getEntryCounter, getMaxLines } from './logs-writer'

export interface LogQuery {
  page: number
  limit: number
  providerId?: number
  dateFrom?: string
  dateTo?: string
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
  // 64KB buffer，平衡内存占用与读取效率
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
  const currentLines = getCurrentFileLines()
  const maxLines = getMaxLines()
  const counts: number[] = []
  for (let i = 0; i < files.length; i++) {
    // 最后一个文件（最新）使用 currentFileLines，其余满额
    counts.push(i === files.length - 1 ? currentLines : maxLines)
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
  // 64KB buffer，平衡内存占用与读取效率
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
    totalCount = getEntryCounter()
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

      // 从文件末尾反向读取，多读以应对过滤淘汰
      // 超读 10 倍以补偿过滤淘汰率，上限 5000 行防止内存浪费
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
