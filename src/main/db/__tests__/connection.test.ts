// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { Database } from '../database'

describe('Database Connection', () => {
  afterEach(() => {
    closeDatabase()
  })

  it('should initialize database in memory', async () => {
    const db = await initDatabase(':memory:')
    expect(db).toBeInstanceOf(Database)
    expect(getDb()).toBe(db)
  })

  it('should return same instance on multiple calls', async () => {
    const db1 = await initDatabase(':memory:')
    const db2 = await initDatabase(':memory:')
    expect(db1).toBe(db2)
  })

  it('should close database without error', async () => {
    await initDatabase(':memory:')
    expect(() => closeDatabase()).not.toThrow()
  })

  it('should throw getDb before initialization', () => {
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('should allow re-initialization after close', async () => {
    const db1 = await initDatabase(':memory:')
    closeDatabase()
    const db2 = await initDatabase(':memory:')
    expect(db2).not.toBe(db1)
  })
})
