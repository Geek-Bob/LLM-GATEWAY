// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createAgentRepository } from '../agents'

describe('Agent Repository', () => {
  let repo: ReturnType<typeof createAgentRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createAgentRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should list all agents', async () => {
    const agents = await repo.list()
    expect(agents.length).toBeGreaterThan(0)
    expect(agents[0]).toHaveProperty('id')
    expect(agents[0]).toHaveProperty('name')
    expect(agents[0]).toHaveProperty('display_name')
  })

  it('should get agent by id', async () => {
    const agents = await repo.list()
    const agent = await repo.getById(agents[0].id)
    expect(agent).toBeDefined()
    expect(agent?.name).toBe(agents[0].name)
  })

  it('should create custom agent', async () => {
    const agent = await repo.create({
      name: 'custom-agent',
      displayName: 'Custom Agent',
      configPath: '~/.custom/config.json',
      configFormat: 'json'
    })
    expect(agent.id).toBeDefined()
    expect(agent.is_builtin).toBe(0)
  })

  it('should update agent', async () => {
    const agents = await repo.list()
    const updated = await repo.update(agents[0].id, { displayName: 'Updated Name' })
    expect(updated?.display_name).toBe('Updated Name')
  })

  it('should return null when updating non-existent agent', async () => {
    const updated = await repo.update(99999, { displayName: 'No One' })
    expect(updated).toBeNull()
  })

  it('should delete custom agent', async () => {
    const agent = await repo.create({
      name: 'to-delete',
      displayName: 'To Delete',
      configPath: '~/.to-delete/config.json',
      configFormat: 'json'
    })
    await repo.remove(agent.id)
    const found = await repo.getById(agent.id)
    expect(found).toBeNull()
  })

  it('should silently remove non-existent id (no throw)', async () => {
    // db 层为纯 CRUD，删除不存在的 id 不抛错（存在性检查由 service 层负责）
    await expect(repo.remove(99999)).resolves.toBeUndefined()
  })

  it('should get agent by name', async () => {
    const agent = await repo.getByName('claude')
    expect(agent).toBeDefined()
    expect(agent?.name).toBe('claude')
    expect(agent?.is_builtin).toBe(1)
  })

  it('should return null for non-existent name', async () => {
    const agent = await repo.getByName('non-existent')
    expect(agent).toBeNull()
  })
})
