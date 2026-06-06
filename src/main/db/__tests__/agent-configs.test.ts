// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createAgentConfigRepository } from '../agent-configs'

describe('Agent Config Repository', () => {
  let repo: ReturnType<typeof createAgentConfigRepository>

  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
    repo = createAgentConfigRepository()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should list configs for agent', async () => {
    const configs = await repo.listByAgent(1)
    expect(configs).toEqual([])
  })

  it('should create config', async () => {
    const config = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"env": {"ANTHROPIC_API_KEY": "test"}}',
    })
    expect(config.id).toBeDefined()
    expect(config.name).toBe('default')
    expect(config.isCurrent).toBe(0)
  })

  it('should get config by id', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"test": true}',
    })
    const config = await repo.getById(created.id)
    expect(config).toBeDefined()
    expect(config?.content).toBe('{"test": true}')
  })

  it('should update config content', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"old": true}',
    })
    const updated = await repo.updateContent(created.id, '{"new": true}')
    expect(updated.content).toBe('{"new": true}')
  })

  it('should delete config', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'to-delete',
      content: '{}',
    })
    await repo.remove(created.id)
    const found = await repo.getById(created.id)
    expect(found).toBeNull()
  })

  it('should not delete current config', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'current',
      content: '{}',
    })
    await repo.setCurrent(1, created.id)
    await expect(repo.remove(created.id)).rejects.toThrow('Cannot delete current config')
  })

  it('should switch current config', async () => {
    const config1 = await repo.create({ agentId: 1, name: 'c1', content: '{}' })
    const config2 = await repo.create({ agentId: 1, name: 'c2', content: '{}' })

    await repo.setCurrent(1, config1.id)
    let current = await repo.getCurrent(1)
    expect(current?.id).toBe(config1.id)

    await repo.setCurrent(1, config2.id)
    current = await repo.getCurrent(1)
    expect(current?.id).toBe(config2.id)
  })
})
