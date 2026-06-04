#!/usr/bin/env node
/**
 * 数据库迁移脚本 — 旧版本 → 当前版本
 *
 * 处理以下列重命名：
 *   providers:  api_key_encrypted → api_key
 *   api_keys:   key_encrypted → key
 *
 * 流程：
 *   1. 备份旧数据库 → config.db.bak
 *   2. 读取旧库所有表数据
 *   3. 按当前 schema 创建新库
 *   4. 映射列名写入新数据
 *   5. 替换旧文件
 *
 * 用法：
 *   node scripts/migrate-db.mjs [数据库路径]
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
  console.error(`❌ 数据库文件不存在: ${dbPath}`)
  process.exit(1)
}

console.log(`📂 数据库路径: ${dbPath}`)

// ── 初始化 sql.js ──
const initSqlJs = require('sql.js')
const SQL = await initSqlJs()

// ── 读取旧数据库 ──
const oldDbData = fs.readFileSync(dbPath)
const oldDb = new SQL.Database(oldDbData)

// ── 探测旧表结构 ──
function getColumns(db, tableName) {
  try {
    const rows = db.exec(`PRAGMA table_info('${tableName}')`)
    if (!rows.length) return []
    return rows[0].values.map((r) => r[1]) // name 列
  } catch {
    return []
  }
}

function tableExists(db, name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)
  return r.length > 0 && r[0].values.length > 0
}

function readAll(db, tableName) {
  if (!tableExists(db, tableName)) return []
  const rows = db.exec(`SELECT * FROM ${tableName}`)
  if (!rows.length) return []
  return rows[0].values
}

// ── 检测是否需要迁移 ──
const providerCols = getColumns(oldDb, 'providers')
const apiKeyCols = getColumns(oldDb, 'api_keys')
const needsProviderMigration = providerCols.includes('api_key_encrypted')
const needsApiKeyMigration = apiKeyCols.includes('key_encrypted')

if (!needsProviderMigration && !needsApiKeyMigration) {
  console.log('✅ 数据库已是最新版本，无需迁移')
  oldDb.close()
  process.exit(0)
}

console.log('🔄 检测到旧版本数据库，开始迁移...')
if (needsProviderMigration) console.log('   providers: api_key_encrypted → api_key')
if (needsApiKeyMigration) console.log('   api_keys:  key_encrypted → key')

// ── 读取所有旧数据 ──
const oldProviders = readAll(oldDb, 'providers')
const oldApiKeys = readAll(oldDb, 'api_keys')
const oldStats = readAll(oldDb, 'request_stats')
const oldStatsProvider = readAll(oldDb, 'request_stats_provider')
const oldConversations = readAll(oldDb, 'conversations')
const oldMessages = readAll(oldDb, 'messages')

console.log(`   providers: ${oldProviders.length} 条`)
console.log(`   api_keys: ${oldApiKeys.length} 条`)
console.log(`   conversations: ${oldConversations.length} 条`)
console.log(`   messages: ${oldMessages.length} 条`)

oldDb.close()

// ── 创建新数据库 ──
const newDb = new SQL.Database()

newDb.run(`
  CREATE TABLE providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    models TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    rate_limit INTEGER NOT NULL DEFAULT 60,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE request_stats (
    stat_date TEXT NOT NULL,
    stat_hour INTEGER NOT NULL,
    total_requests INTEGER DEFAULT 0,
    total_tokens_in INTEGER DEFAULT 0,
    total_tokens_out INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    PRIMARY KEY (stat_date, stat_hour)
  );

  CREATE TABLE request_stats_provider (
    stat_date TEXT NOT NULL,
    stat_hour INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    total_requests INTEGER DEFAULT 0,
    total_tokens_in INTEGER DEFAULT 0,
    total_tokens_out INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    PRIMARY KEY (stat_date, stat_hour, provider_id, model)
  );

  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '新对话',
    provider_id INTEGER,
    model TEXT NOT NULL,
    api_key_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    thinking TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`)

// ── 写入数据（映射旧列名）──

// providers: api_key_encrypted → api_key
const providerStmt = newDb.prepare(
  'INSERT INTO providers (id, name, provider_type, base_url, api_key, models, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
for (const row of oldProviders) {
  const cols = providerCols
  const get = (name) => row[cols.indexOf(name)] ?? ''
  providerStmt.run([
    get('id'),
    get('name'),
    get('provider_type'),
    get('base_url'),
    get(needsProviderMigration ? 'api_key_encrypted' : 'api_key'),
    get('models'),
    get('is_active') ?? 1,
    get('created_at'),
    get('updated_at'),
  ])
}
providerStmt.free()

// api_keys: key_encrypted → key
const apiKeyStmt = newDb.prepare(
  'INSERT INTO api_keys (id, name, key_prefix, key_hash, key, is_active, rate_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
)
for (const row of oldApiKeys) {
  const cols = apiKeyCols
  const get = (name) => row[cols.indexOf(name)] ?? ''
  apiKeyStmt.run([
    get('id'),
    get('name'),
    get('key_prefix'),
    get('key_hash'),
    get(needsApiKeyMigration ? 'key_encrypted' : 'key'),
    get('is_active') ?? 1,
    get('rate_limit') ?? 60,
    get('created_at'),
  ])
}
apiKeyStmt.free()

// request_stats — 列名不变
const statsStmt = newDb.prepare(
  'INSERT INTO request_stats (stat_date, stat_hour, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
for (const row of oldStats) {
  statsStmt.run(row)
}
statsStmt.free()

// request_stats_provider — 列名不变
const statsProvStmt = newDb.prepare(
  'INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
for (const row of oldStatsProvider) {
  statsProvStmt.run(row)
}
statsProvStmt.free()

// conversations — 列名不变
const convStmt = newDb.prepare(
  'INSERT INTO conversations (id, title, provider_id, model, api_key_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
for (const row of oldConversations) {
  convStmt.run(row)
}
convStmt.free()

// messages — 列名不变
const msgStmt = newDb.prepare(
  'INSERT INTO messages (id, conversation_id, role, content, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?)'
)
for (const row of oldMessages) {
  msgStmt.run(row)
}
msgStmt.free()

// ── 备份旧文件，写入新文件 ──
const bakPath = dbPath + '.bak'
fs.copyFileSync(dbPath, bakPath)
console.log(`💾 旧库已备份: ${bakPath}`)

const newData = newDb.export()
const newBuf = Buffer.from(newData)
fs.writeFileSync(dbPath, newBuf)
newDb.close()

console.log(`✅ 迁移完成！新数据库已写入: ${dbPath}`)
console.log(`   如有问题，可恢复备份: cp "${bakPath}" "${dbPath}"`)
