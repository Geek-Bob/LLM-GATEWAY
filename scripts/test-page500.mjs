import fs from 'fs'
import path from 'path'

const logsDir = path.join(process.env.APPDATA, 'llm-gateway', 'logs')
const metaFile = path.join(logsDir, 'logs-meta.json')
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))

console.log('=== Meta ===')
console.log('entryCounter:', meta.entryCounter)
console.log('currentFileNumber:', meta.currentFileNumber)
console.log('currentFileLines:', meta.currentFileLines)

// 模拟 getFileLineCounts
const files = fs.readdirSync(logsDir)
  .filter(f => f.endsWith('.ndjson'))
  .sort()
  .map(f => path.join(logsDir, f))

console.log('\n=== Files ===')
const lineCounts = files.map((f, i) => {
  const count = i === files.length - 1 ? meta.currentFileLines : 1000
  console.log(path.basename(f), '→', count, 'lines')
  return count
})

const total = lineCounts.reduce((a, b) => a + b, 0)
console.log('Total:', total)

// 模拟 locatePosition
function locatePosition(skipFromEnd) {
  let remaining = skipFromEnd
  for (let i = files.length - 1; i >= 0; i--) {
    if (remaining < lineCounts[i]) {
      return { fileIndex: i, offsetInFile: remaining }
    }
    remaining -= lineCounts[i]
  }
  return { fileIndex: 0, offsetInFile: 0 }
}

const skip = (500 - 1) * 10 // 4990
console.log('\n=== Page 500 (skip=' + skip + ') ===')
const start = locatePosition(skip)
const end = locatePosition(skip + 10)
console.log('start:', start)
console.log('end:', end)

// 读取文件 0 的前几行验证
console.log('\n=== File 0 first 3 lines ===')
const fd = fs.openSync(files[0], 'r')
const buf = Buffer.alloc(64 * 1024)
const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0)
fs.closeSync(fd)
const text = buf.toString('utf-8', 0, bytesRead)
const lines = text.split('\n')
for (let i = 0; i < Math.min(3, lines.length); i++) {
  console.log(`Line ${i}:`, lines[i].substring(0, 80) + '...')
}

// 验证文件 0 的实际行数
console.log('\n=== Counting lines in file 0 (streaming) ===')
const stat = fs.statSync(files[0])
console.log('File size:', (stat.size / 1024 / 1024).toFixed(1), 'MB')

const fd2 = fs.openSync(files[0], 'r')
const chunkBuf = Buffer.alloc(64 * 1024)
let lineCount = 0
let pos = 0
let bytesRead2
while ((bytesRead2 = fs.readSync(fd2, chunkBuf, 0, chunkBuf.length, pos)) > 0) {
  pos += bytesRead2
  for (let i = 0; i < bytesRead2; i++) {
    if (chunkBuf[i] === 10) lineCount++
  }
}
fs.closeSync(fd2)
console.log('Actual lines:', lineCount)
