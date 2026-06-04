import fs from 'fs'
import path from 'path'
import readline from 'readline'

const MAX_LINES = 500
const logsDir = path.join(process.env.APPDATA, 'llm-gateway', 'logs')

// 读取旧 meta
const metaFile = path.join(logsDir, 'logs-meta.json')
const oldMeta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
console.log('旧 meta:', oldMeta)

// 备份旧文件
const backupDir = logsDir + '-backup-' + Date.now()
fs.mkdirSync(backupDir, { recursive: true })
const oldFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.ndjson'))
for (const f of oldFiles) {
  fs.copyFileSync(path.join(logsDir, f), path.join(backupDir, f))
  fs.unlinkSync(path.join(logsDir, f))
}
console.log(`备份 ${oldFiles.length} 个文件到 ${backupDir}`)

// 流式读取所有旧文件，按 500 行写入新文件
const allOldFiles = oldFiles.sort().map(f => path.join(backupDir, f))
let fileNum = 0
let lineCount = 0
let totalLines = 0
let currentFd = null

function openNewFile() {
  fileNum++
  const fileName = `logs-${String(fileNum).padStart(4, '0')}.ndjson`
  const filePath = path.join(logsDir, fileName)
  console.log(`创建 ${fileName}`)
  currentFd = fs.openSync(filePath, 'w')
  lineCount = 0
}

function closeCurrentFile() {
  if (currentFd !== null) {
    fs.closeSync(currentFd)
    currentFd = null
  }
}

openNewFile()

for (const oldFile of allOldFiles) {
  const rl = readline.createInterface({
    input: fs.createReadStream(oldFile, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (!line.trim()) continue

    if (lineCount >= MAX_LINES) {
      closeCurrentFile()
      openNewFile()
    }

    fs.writeSync(currentFd, line + '\n')
    lineCount++
    totalLines++

    if (totalLines % 1000 === 0) {
      console.log(`已处理 ${totalLines} 行...`)
    }
  }
}

closeCurrentFile()

// 更新 meta
const meta = {
  entryCounter: totalLines,
  currentFileNumber: fileNum,
  currentFileLines: lineCount
}
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
console.log('更新 logs-meta.json:', meta)
console.log(`迁移完成! 共 ${totalLines} 行，${fileNum} 个文件`)
