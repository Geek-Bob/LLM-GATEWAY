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
    expect(columnNames).toContain('api_key_encrypted')
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
        "INSERT INTO providers (name, provider_type, base_url, api_key_encrypted) VALUES ('test', 'openai', 'https://test.com', 'key')"
      )
      .run()
    expect(() => {
      getDb()!
        .prepare(
          "INSERT INTO providers (name, provider_type, base_url, api_key_encrypted) VALUES ('test', 'openai', 'https://test.com', 'key')"
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
})
