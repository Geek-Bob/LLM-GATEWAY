// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'

describe('Schema - createTables', () => {
  afterEach(() => {
    closeDatabase()
  })

  it('should create providers table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('providers')
  })

  it('should create api_keys table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('api_keys')
  })

  it('should create request_stats table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='request_stats'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('request_stats')
  })

  it('should have correct providers columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('providers')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('provider_type')
    expect(columnNames).toContain('base_url')
    expect(columnNames).toContain('api_key')
    expect(columnNames).toContain('models')
    expect(columnNames).toContain('is_active')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should have correct api_keys columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('api_keys')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('key_prefix')
    expect(columnNames).toContain('key_hash')
    expect(columnNames).toContain('is_active')
    expect(columnNames).toContain('rate_limit')
    expect(columnNames).toContain('created_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should have correct request_stats columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('request_stats')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('stat_date')
    expect(columnNames).toContain('stat_hour')
    expect(columnNames).toContain('total_requests')
    expect(columnNames).toContain('total_tokens_in')
    expect(columnNames).toContain('total_tokens_out')
    expect(columnNames).toContain('total_cache_tokens')
    expect(columnNames).toContain('total_errors')
    expect(columnNames).toContain('total_duration_ms')
  })

  it('should have correct request_stats_provider columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('request_stats_provider')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('stat_date')
    expect(columnNames).toContain('stat_hour')
    expect(columnNames).toContain('provider_id')
    expect(columnNames).toContain('model')
    expect(columnNames).toContain('total_requests')
    expect(columnNames).toContain('total_tokens_in')
    expect(columnNames).toContain('total_tokens_out')
    expect(columnNames).toContain('total_cache_tokens')
    expect(columnNames).toContain('total_errors')
    expect(columnNames).toContain('total_duration_ms')
  })

  it('should create provider_pricing table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_pricing'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('provider_pricing')
  })

  it('should have correct provider_pricing columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('provider_pricing')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('provider_id')
    expect(columnNames).toContain('model')
    expect(columnNames).toContain('price_in_cached')
    expect(columnNames).toContain('price_in_uncached')
    expect(columnNames).toContain('price_out')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')
  })

  it('should enforce UNIQUE constraint on providers.name', async () => {
    await initDatabase(':memory:')
    createTables()

    getDb()!
      .prepare(
        "INSERT INTO providers (name, provider_type, base_url, api_key) VALUES ('test', 'openai', 'https://test.com', 'key')"
      )
      .run()
    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO providers (name, provider_type, base_url, api_key) VALUES ('test', 'openai', 'https://test.com', 'key')"
        )
        .run()
    }).toThrow()
  })

  it('should enforce UNIQUE constraint on api_keys.key_hash', async () => {
    await initDatabase(':memory:')
    createTables()

    getDb()!
      .prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash) VALUES ('test', 'sk-test', 'hash123')"
      )
      .run()
    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO api_keys (name, key_prefix, key_hash) VALUES ('test', 'sk-test', 'hash123')"
        )
        .run()
    }).toThrow()
  })

  // ── agents 表 ──────────────────────────────────────────

  it('should create agents table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('agents')
  })

  it('should have correct agents columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('agents')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('display_name')
    expect(columnNames).toContain('config_path')
    expect(columnNames).toContain('config_format')
    expect(columnNames).toContain('is_builtin')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should enforce UNIQUE constraint on agents.name', async () => {
    await initDatabase(':memory:')
    createTables()

    getDb()!
      .prepare(
        "INSERT INTO agents (name, display_name, config_path, config_format) VALUES ('test-agent', 'Test Agent', '/path/to/config', 'json')"
      )
      .run()
    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO agents (name, display_name, config_path, config_format) VALUES ('test-agent', 'Duplicate', '/path/to/other', 'json')"
        )
        .run()
    }).toThrow()
  })

  it('should enforce CHECK constraint on agents.config_format', async () => {
    await initDatabase(':memory:')
    createTables()

    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO agents (name, display_name, config_path, config_format) VALUES ('bad-agent', 'Bad', '/path', 'yaml')"
        )
        .run()
    }).toThrow()
  })

  // ── agent_configs 表 ───────────────────────────────────

  it('should create agent_configs table', async () => {
    await initDatabase(':memory:')
    createTables()

    const row = getDb()!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_configs'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('agent_configs')
  })

  it('should have correct agent_configs columns', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('agent_configs')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('agent_id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('content')
    expect(columnNames).toContain('is_current')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should enforce UNIQUE constraint on agent_configs(agent_id, name)', async () => {
    await initDatabase(':memory:')
    createTables()

    // 先插入一个 agent
    getDb()!
      .prepare(
        "INSERT INTO agents (name, display_name, config_path, config_format) VALUES ('test-agent', 'Test Agent', '/path', 'json')"
      )
      .run()

    getDb()!
      .prepare(
        "INSERT INTO agent_configs (agent_id, name, content) VALUES (1, 'default', '{}')"
      )
      .run()

    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO agent_configs (agent_id, name, content) VALUES (1, 'default', '{\"key\":\"val\"}')"
        )
        .run()
    }).toThrow()
  })

  // ── 内置 Agent 预设 ────────────────────────────────────

  it('should initialize builtin agents on createTables', async () => {
    await initDatabase(':memory:')
    createTables()

    const rows = getDb()!
      .prepare('SELECT name FROM agents WHERE is_builtin = 1')
      .all() as Array<{ name: string }>

    const names = rows.map((r) => r.name)
    expect(names).toContain('claude')
    expect(names).toContain('codex')
    expect(names).toContain('gemini')
    expect(names).toContain('claude-desktop')
    expect(names).toContain('opencode')
    expect(names).toContain('openclaw')
    expect(names).toContain('hermes')
    expect(names).toHaveLength(7)
  })

  it('should not duplicate builtin agents on repeated createTables', async () => {
    await initDatabase(':memory:')
    createTables()
    createTables() // 幂等调用

    const rows = getDb()!
      .prepare('SELECT COUNT(*) as cnt FROM agents WHERE is_builtin = 1')
      .get() as { cnt: number }

    expect(rows.cnt).toBe(7)
  })

  it('should cascade delete agent_configs when agent is deleted', async () => {
    await initDatabase(':memory:')
    createTables()

    // 插入自定义 agent 并获取其真实 id
    getDb()!
      .prepare(
        "INSERT INTO agents (name, display_name, config_path, config_format, is_builtin) VALUES ('test-agent', 'Test Agent', '~/.test/config.json', 'json', 0)"
      )
      .run()
    const row = getDb()!
      .prepare('SELECT last_insert_rowid() as id')
      .get() as { id: number }
    const agentId = row.id

    // 用真实 id 插入 config
    getDb()!
      .prepare(
        'INSERT INTO agent_configs (agent_id, name, content) VALUES (?, ?, ?)'
      )
      .run([agentId, 'default', '{}'])

    // 验证 config 存在
    const configsBefore = getDb()!
      .prepare('SELECT COUNT(*) as cnt FROM agent_configs WHERE agent_id = ?')
      .get([agentId]) as { cnt: number }
    expect(configsBefore.cnt).toBe(1)

    // 删除 agent
    getDb()!.prepare('DELETE FROM agents WHERE id = ?').run([agentId])

    // 验证 config 被级联删除
    const configsAfter = getDb()!
      .prepare('SELECT COUNT(*) as cnt FROM agent_configs WHERE agent_id = ?')
      .get([agentId]) as { cnt: number }
    expect(configsAfter.cnt).toBe(0)
  })

  // ── conversations 表（思考参数透传新增列）──────────────

  it('should create conversations table with thinking_type and reasoning_effort columns for fresh install', async () => {
    await initDatabase(':memory:')
    createTables()

    const columns = getDb()!
      .prepare("PRAGMA table_info('conversations')")
      .all() as Array<{ name: string; type: string; notnull: number }>

    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('thinking_type')
    expect(columnNames).toContain('reasoning_effort')

    // 两列均 nullable、TEXT 类型、无默认值（向后兼容旧对话，NULL 视为 disabled/不传）
    const thinkingTypeCol = columns.find((c) => c.name === 'thinking_type')
    expect(thinkingTypeCol!.type).toBe('TEXT')
    expect(thinkingTypeCol!.notnull).toBe(0)

    const reasoningEffortCol = columns.find((c) => c.name === 'reasoning_effort')
    expect(reasoningEffortCol!.type).toBe('TEXT')
    expect(reasoningEffortCol!.notnull).toBe(0)
  })

  it('should ALTER conversations table to add new columns for legacy databases without data loss', async () => {
    await initDatabase(':memory:')
    // 模拟旧库：手动建一个无新列的 conversations 表并写入数据
    getDb()!.exec(`
      CREATE TABLE conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '新对话',
        provider_id INTEGER,
        model TEXT NOT NULL,
        api_key_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO conversations (title, model) VALUES ('旧对话', 'gpt-4');
    `)

    // 触发迁移：createTables 内幂等 ALTER 补列
    expect(() => createTables()).not.toThrow()

    const columns = getDb()!
      .prepare("PRAGMA table_info('conversations')")
      .all() as Array<{ name: string }>
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('thinking_type')
    expect(columnNames).toContain('reasoning_effort')

    // 已有数据不丢失，新列为 NULL
    const row = getDb()!
      .prepare(
        'SELECT title, model, thinking_type, reasoning_effort FROM conversations WHERE id = 1'
      )
      .get() as {
        title: string
        model: string
        thinking_type: null
        reasoning_effort: null
      }
    expect(row.title).toBe('旧对话')
    expect(row.model).toBe('gpt-4')
    expect(row.thinking_type).toBeNull()
    expect(row.reasoning_effort).toBeNull()
  })

  it('should be idempotent when createTables runs repeatedly with new columns already present', async () => {
    await initDatabase(':memory:')
    createTables()
    // 第二次调用：列已存在，ALTER 不应执行，不应报错
    expect(() => createTables()).not.toThrow()

    const columns = getDb()!
      .prepare("PRAGMA table_info('conversations')")
      .all() as Array<{ name: string }>
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('thinking_type')
    expect(columnNames).toContain('reasoning_effort')
  })
})
