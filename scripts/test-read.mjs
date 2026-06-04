import fs from 'fs'
import path from 'path'

const logsDir = path.join(process.env.APPDATA, 'llm-gateway', 'logs')
const file = path.join(logsDir, 'logs-0001.ndjson')

// 模拟 countLines
function countLines(filePath) {
  const stat = fs.statSync(filePath)
  if (stat.size === 0) return 0
  if (stat.size < 10 * 1024 * 1024) {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content ? content.trimEnd().split('\n').length : 0
  }
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(64 * 1024)
  let lines = 0
  let bytesRead
  let lastByte = 0
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 10) lines++
      lastByte = buf[i]
    }
  }
  fs.closeSync(fd)
  if (lastByte !== 10 && stat.size > 0) lines++
  return lines
}

// 模拟 readLinesFromStart
function readLinesFromStart(filePath, skipFromStart, count) {
  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 64 * 1024
  const buf = Buffer.alloc(chunkSize)
  let bytesRead
  let position = 0
  let lineIndex = 0
  let partial = ''
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
function readRangeFromFile(filePath, startFromEnd, count) {
  const totalLines = countLines(filePath)
  console.log('countLines result:', totalLines)
  const skipFromStart = Math.max(0, totalLines - startFromEnd - count)
  console.log('skipFromStart:', skipFromStart)
  const lines = readLinesFromStart(filePath, skipFromStart, count)
  console.log('readLinesFromStart returned:', lines.length, 'lines')
  return lines.reverse()
}

console.log('=== Testing readRangeFromFile(file, 375, 10) ===')
const t0 = Date.now()
const result = readRangeFromFile(file, 375, 10)
console.log('Time:', Date.now() - t0, 'ms')
console.log('Result count:', result.length)
if (result.length > 0) {
  console.log('First line id:', JSON.parse(result[0]).id)
  console.log('Last line id:', JSON.parse(result[result.length - 1]).id)
}
