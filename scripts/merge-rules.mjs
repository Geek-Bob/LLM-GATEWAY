import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const RULES_DIR = join(import.meta.dirname, '..', '.claude', 'rules')
const OUTPUT = join(import.meta.dirname, '..', '.claude', 'rules-merged.md')

async function main() {
  const files = []

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.md')) {
        files.push(full)
      }
    }
  }

  await walk(RULES_DIR)
  files.sort()

  const parts = []
  for (const file of files) {
    const relPath = relative(join(import.meta.dirname, '..'), file).replaceAll(sep, '/')
    const content = await readFile(file, 'utf-8')
    parts.push(`【${relPath}\n${content}】`)
  }

  await writeFile(OUTPUT, parts.join('\n\n'), 'utf-8')
  console.log(`✅ 已合并 ${files.length} 个文件 → ${relative(join(import.meta.dirname, '..'), OUTPUT).replaceAll(sep, '/')}`)
}

main()
