import { getDb } from './connection'

export function createTables(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      models TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_encrypted TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      rate_limit INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS request_stats (
      stat_date TEXT NOT NULL,
      stat_hour INTEGER NOT NULL,
      total_requests INTEGER DEFAULT 0,
      total_tokens_in INTEGER DEFAULT 0,
      total_tokens_out INTEGER DEFAULT 0,
      total_errors INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      PRIMARY KEY (stat_date, stat_hour)
    );

    CREATE TABLE IF NOT EXISTS request_stats_provider (
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

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新对话',
      provider_id INTEGER,
      model TEXT NOT NULL,
      api_key_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      thinking TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `)

  // Migration: add key_encrypted to existing databases
  try {
    db.exec(`ALTER TABLE api_keys ADD COLUMN key_encrypted TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists — ignore
  }
}
