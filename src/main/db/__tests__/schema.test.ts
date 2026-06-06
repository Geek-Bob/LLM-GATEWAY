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
    expect(columnNames).toContain('total_errors')
    expect(columnNames).toContain('total_duration_ms')
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

  it('should cascade delete agent_configs when agent is deleted', async () => {
    await initDatabase(':memory:')
    createTables()

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

    // 删除 agent
    getDb()!.prepare('DELETE FROM agents WHERE id = 1').run()

    // agent_configs 也应被级联删除
    const row = getDb()!
      .prepare('SELECT COUNT(*) as cnt FROM agent_configs')
      .get() as { cnt: number }

    expect(row.cnt).toBe(0)
  })
})
