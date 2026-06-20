#!/usr/bin/env node
/**
 * 数据库迁移脚本 — 新增缓存 token 列与单价表
 *
 * 对已存在的 request_stats 和 request_stats_provider 表
 * 执行 ALTER TABLE ADD COLUMN total_cache_tokens（幂等：先查列是否存在）
 * 并创建 provider_pricing 表（CREATE TABLE IF NOT EXISTS）。
 *
 * ── 迁移依赖顺序 ────────────────────────────────────────
 * 从旧版本升级的路径：
 *   1. 先运行 node scripts/migrate-db.mjs              ← 建旧表结构（providers/api_keys 列重命名）
 *   2. 再运行 node scripts/migrate-pricing-cache.mjs    ← 当前脚本
 *
 * 本脚本做三件事：
 *   - request_stats 表添加 total_cache_tokens 列
 *   - request_stats_provider 表添加 total_cache_tokens 列
 *   - 新建 provider_pricing 表（供应商单价配置）
 *
 * migrate-db.mjs 不处理 total_cache_tokens 和 provider_pricing，
 * 因此本脚本必须在 migrate-db.mjs 之后独立运行。
 * ───────────────────────────────────────────────────────
 *
 * 用法：
 *   node scripts/migrate-pricing-cache.mjs [数据库路径]
 *   默认路径：%APPDATA%/llm-gateway/config.db
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// ── 默认数据库路径 ──
const defaultDbPath = path.join(
  process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
  'llm-gateway',
  'config.db'
)
const dbPath = process.argv[2] || defaultDbPath

if (!fs.existsSync(dbPath)) {
  console.error(`数据库文件不存在: ${dbPath}`)
  process.exit(1)
}

console.log(`数据库路径: ${dbPath}`)

// ── 初始化 sql.js ──
const initSqlJs = require('sql.js')
const SQL = await initSqlJs()

// ── 读取数据库 ──
const dbData = fs.readFileSync(dbPath)
const db = new SQL.Database(dbData)

// ── 辅助函数 ──

/** 获取表的所有列名 */
function getColumns(db, tableName) {
  try {
    const rows = db.exec(`PRAGMA table_info('${tableName}')`)
    if (!rows.length) return []
    return rows[0].values.map((r) => r[1])
  } catch {
    return []
  }
}

/** 检查表是否存在 */
function tableExists(db, name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)
  return r.length > 0 && r[0].values.length > 0
}

// ── 1. 给 request_stats 加 total_cache_tokens 列 ──
const statsCols = getColumns(db, 'request_stats')
const needsStatsMigration = !statsCols.includes('total_cache_tokens')

if (needsStatsMigration) {
  try {
    db.exec('ALTER TABLE request_stats ADD COLUMN total_cache_tokens INTEGER NOT NULL DEFAULT 0')
    console.log('  request_stats: 已添加 total_cache_tokens 列')
  } catch (e) {
    console.warn(`  request_stats: 添加列失败 — ${e.message}`)
  }
} else {
  console.log('  request_stats: total_cache_tokens 列已存在，跳过')
}

// ── 2. 给 request_stats_provider 加 total_cache_tokens 列 ──
const statsProvCols = getColumns(db, 'request_stats_provider')
const needsStatsProvMigration = !statsProvCols.includes('total_cache_tokens')

if (needsStatsProvMigration) {
  try {
    db.exec('ALTER TABLE request_stats_provider ADD COLUMN total_cache_tokens INTEGER NOT NULL DEFAULT 0')
    console.log('  request_stats_provider: 已添加 total_cache_tokens 列')
  } catch (e) {
    console.warn(`  request_stats_provider: 添加列失败 — ${e.message}`)
  }
} else {
  console.log('  request_stats_provider: total_cache_tokens 列已存在，跳过')
}

// ── 3. 创建 provider_pricing 表（幂等） ──
if (!tableExists(db, 'provider_pricing')) {
  try {
    db.exec(`
      CREATE TABLE provider_pricing (
        provider_id INTEGER NOT NULL,
        model TEXT NOT NULL,
        price_in_cached REAL NOT NULL DEFAULT 0,
        price_in_uncached REAL NOT NULL DEFAULT 0,
        price_out REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (provider_id, model),
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      )
    `)
    console.log('  provider_pricing: 表已创建')
  } catch (e) {
    console.warn(`  provider_pricing: 创建表失败 — ${e.message}`)
  }
} else {
  console.log('  provider_pricing: 表已存在，跳过')
}

// ── 写入变更 ──
const newData = db.export()
const newBuf = Buffer.from(newData)
fs.writeFileSync(dbPath, newBuf)
db.close()

console.log('迁移完成！')
