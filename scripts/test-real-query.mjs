import fs from 'fs'
import path from 'path'

const logsDir = path.join(process.env.APPDATA, 'llm-gateway', 'logs')
const metaFile = path.join(logsDir, 'logs-meta.json')
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))

console.log('=== Meta ===')
console.log(meta)

// 模拟 getFileList
const files = fs.readdirSync(logsDir)
  .filter(f => /^logs-\d{4}\.ndjson$/.test(f))
  .sort()
  .map(f => path.join(logsDir, f))

console.log('\n=== Files ===')
files.forEach(f => console.log(path.basename(f), (fs.statSync(f).size / 1024 / 1024).toFixed(1) + 'MB'))

// 模拟 getFileLineCounts
const lineCounts = files.map((_, i) => i === files.length - 1 ? meta.currentFileLines : 1000)
console.log('\n=== lineCounts ===', lineCounts)

// 模拟 locatePosition
function locatePosition(skipFromEnd) {
  let remaining = skipFromEnd
  for (let i = files.length - 1; i >= 0; i--) {
    if (remaining < lineCounts[i]) return { fileIndex: i, offsetInFile: remaining }
    remaining -= lineCounts[i]
  }
  return { fileIndex: 0, offsetInFile: 0 }
}

// 模拟 readLinesFromStart
function readLinesFromStart(filePath, skipFromStart, count) {
  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 64 * 1024
  const buf = Buffer.alloc(chunkSize)
  let bytesRead, position = 0, lineIndex = 0, partial = ''
  const result = []
  try {
    while ((bytesRead = fs.readSync(fd, buf, 0, chunkSize, position)) > 0) {
      position += bytesRead
      const text = partial + buf.toString('utf-8', 0, bytesRead)
      const parts = text.split('\n')
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
    if (partial.trim() && lineIndex >= skipFromStart && result.length < count) {
      result.push(partial.trim())
    }
  } finally {
    fs.closeSync(fd)
  }
  return result
}

// 模拟 readRangeFromFile
function readRangeFromFile(filePath, startFromEnd, count, totalLines) {
  const skipFromStart = Math.max(0, totalLines - startFromEnd - count)
  const effectiveCount = Math.min(count, totalLines - startFromEnd - skipFromStart)
  console.log(`  readRangeFromFile: totalLines=${totalLines}, startFromEnd=${startFromEnd}, count=${count}, skipFromStart=${skipFromStart}, effectiveCount=${effectiveCount}`)
  const lines = readLinesFromStart(filePath, skipFromStart, effectiveCount)
  console.log(`  readLinesFromStart returned ${lines.length} lines`)
  return lines.reverse()
}

// 测试 page 500
const skip = (500 - 1) * 10
console.log(`\n=== Page 500 (skip=${skip}) ===`)
const start = locatePosition(skip)
const end = locatePosition(skip + 10)
console.log('start:', start)
console.log('end:', end)

if (start.fileIndex === end.fileIndex) {
  console.log('\n同文件读取:')
  const t0 = Date.now()
  const rawLines = readRangeFromFile(files[start.fileIndex], start.offsetInFile, 10, lineCounts[start.fileIndex])
  console.log(`Time: ${Date.now() - t0}ms`)
  console.log(`Got ${rawLines.length} lines`)
  if (rawLines.length > 0) {
    const first = JSON.parse(rawLines[0])
    const last = JSON.parse(rawLines[rawLines.length - 1])
    console.log(`First id: ${first.id}, Last id: ${last.id}`)
  }
} else {
  console.log('跨文件读取')
}
