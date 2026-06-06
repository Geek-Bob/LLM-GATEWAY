/**
 * 数据库表结构定义模块
 *
 * 负责创建应用所需的所有 SQLite 表，包括供应商、API 密钥、
 * 请求统计、对话历史等核心数据模型。
 * 在应用启动时由 startServer() 调用。
 *
 * 注意：此文件只定义当前版本的表结构，不包含增量迁移逻辑。
 * 旧版本数据库迁移请使用 scripts/migrate-db.mjs 独立脚本。
 */

import { getDb } from './connection'

/**
 * 创建所有数据库表并初始化内置 Agent 预设（幂等）
 * 使用 CREATE TABLE IF NOT EXISTS 确保多次调用安全。
 * 内置 Agent 使用 INSERT OR IGNORE 避免重复插入。
 * 仅适用于新安装或已迁移后的数据库。
 */
export function createTables(): void {
  const db = getDb()

  db.exec(`
    -- 供应商表：存储 LLM 供应商的连接信息（API 地址、密钥、可用模型列表）
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      models TEXT NOT NULL DEFAULT '[]',       -- JSON 数组，如 ["claude-3-opus","gpt-4"]
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 模型映射表：将客户端请求的 source_model 转换为目标供应商的实际 model
    -- UNIQUE(source_model) 确保每个源模型只有一条映射规则
    CREATE TABLE IF NOT EXISTS model_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_model TEXT NOT NULL UNIQUE,
      target_model TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- API 密钥表：用于代理认证的本地 API 密钥
    -- key_hash 用于快速查找比对，key_prefix 用于界面显示
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      rate_limit INTEGER NOT NULL DEFAULT 60,  -- 每分钟最大请求数
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 请求统计表（按小时聚合）：记录所有供应商的总请求量
    -- 复合主键确保每小时唯一记录，避免重复统计
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

    -- 请求统计表（按供应商+模型粒度）：比 request_stats 维度更细
    -- 用于仪表盘按供应商和模型下钻分析流量分布
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

    -- 对话表：存储聊天会话元信息（主题、使用的模型和供应商）
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新对话',
      provider_id INTEGER,
      model TEXT NOT NULL,
      api_key_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 消息表：存储对话中的每条用户/助手消息
    -- conversation_id 设置级联删除，删除对话时自动清理关联消息
    -- thinking 字段存放 deepseek 的内部推理过程（Anthropic 格式兼容）
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      thinking TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Agent 表：存储可复用的 Agent 配置模板
    -- name 全局唯一，config_format 限定为 json/toml/env 三种格式
    -- is_builtin 标记是否为内置 Agent（不可删除）
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      config_path TEXT NOT NULL,
      config_format TEXT NOT NULL CHECK (config_format IN ('json', 'toml', 'env')),
      is_builtin INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent 配置版本表：存储同一 Agent 的多个配置版本
    -- agent_id 级联删除，删除 Agent 时自动清理关联配置
    -- UNIQUE(agent_id, name) 确保同一 Agent 下配置名唯一
    -- is_current 标记当前激活的配置版本
    CREATE TABLE IF NOT EXISTS agent_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, name)
    );
  `)

  // 插入内置 Agent 预设（INSERT OR IGNORE 确保幂等）
  const builtinAgents = [
    { name: 'claude', displayName: 'Claude Code', configPath: '~/.claude/settings.json', format: 'json' },
    { name: 'claude-desktop', displayName: 'Claude Desktop', configPath: '~/.claude-desktop/config.json', format: 'json' },
    { name: 'codex', displayName: 'Codex', configPath: '~/.codex/config.toml', format: 'toml' },
    { name: 'gemini', displayName: 'Gemini CLI', configPath: '~/.gemini/settings.json', format: 'json' },
    { name: 'opencode', displayName: 'OpenCode', configPath: '~/.opencode/config.json', format: 'json' },
    { name: 'openclaw', displayName: 'OpenClaw', configPath: '~/.openclaw/config.json', format: 'json' },
    { name: 'hermes', displayName: 'Hermes', configPath: '~/.hermes/config.json', format: 'json' },
  ]

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO agents (name, display_name, config_path, config_format, is_builtin)
     VALUES (?, ?, ?, ?, 1)`
  )
  for (const agent of builtinAgents) {
    stmt.run([agent.name, agent.displayName, agent.configPath, agent.format])
  }
}
