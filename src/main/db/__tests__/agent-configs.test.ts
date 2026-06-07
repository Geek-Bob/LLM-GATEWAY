// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import { createAgentConfigRepository } from '../agent-configs'
import type { Database } from '../database'

describe('Agent Config Repository', () => {
  let db: Database
  let repo: ReturnType<typeof createAgentConfigRepository>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    createTables()
    repo = createAgentConfigRepository(db)
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
    await expect(repo.remove(created.id)).rejects.toThrow(`Failed to delete config: cannot delete current config ${created.id}`)
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

  it('should return null for non-existent id', async () => {
    const config = await repo.getById(999)
    expect(config).toBeNull()
  })

  it('should return null when no current config', async () => {
    const current = await repo.getCurrent(1)
    expect(current).toBeNull()
  })

  it('should throw on duplicate name for same agent', async () => {
    await repo.create({ agentId: 1, name: 'unique', content: '{}' })
    await expect(repo.create({ agentId: 1, name: 'unique', content: '{}' }))
      .rejects.toThrow()
  })

  it('should isolate configs between agents', async () => {
    await repo.create({ agentId: 1, name: 'config1', content: '{}' })
    await repo.create({ agentId: 2, name: 'config2', content: '{}' })

    const agent1Configs = await repo.listByAgent(1)
    const agent2Configs = await repo.listByAgent(2)

    expect(agent1Configs.length).toBe(1)
    expect(agent1Configs[0].name).toBe('config1')
    expect(agent2Configs.length).toBe(1)
    expect(agent2Configs[0].name).toBe('config2')
  })

  it('should clear old current when setting new current', async () => {
    const config1 = await repo.create({ agentId: 1, name: 'c1', content: '{}' })
    const config2 = await repo.create({ agentId: 1, name: 'c2', content: '{}' })

    await repo.setCurrent(1, config1.id)
    const old1 = await repo.getById(config1.id)
    expect(old1?.isCurrent).toBe(1)

    await repo.setCurrent(1, config2.id)
    const old2 = await repo.getById(config1.id)
    expect(old2?.isCurrent).toBe(0)

    const new2 = await repo.getById(config2.id)
    expect(new2?.isCurrent).toBe(1)
  })

  it('should throw when setCurrent with non-existent config', async () => {
    await expect(repo.setCurrent(1, 999)).rejects.toThrow('Failed to set current config: config 999 not found')
  })

  it('should throw when setCurrent with config from different agent', async () => {
    const config = await repo.create({ agentId: 1, name: 'c1', content: '{}' })
    await expect(repo.setCurrent(2, config.id)).rejects.toThrow(
      `Failed to set current config: config ${config.id} does not belong to agent 2`
    )
  })

  it('should throw when removing non-existent config', async () => {
    await expect(repo.remove(999)).rejects.toThrow('Failed to delete config: config 999 not found')
  })

  it('should throw when updating non-existent config', async () => {
    await expect(repo.updateContent(999, '{}')).rejects.toThrow('Failed to update config: config 999 not found')
  })
})
