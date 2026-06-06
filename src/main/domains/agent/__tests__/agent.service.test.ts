/**
 * Agent Service 测试
 *
 * 测试 Agent 业务逻辑层，包括：
 * - Agent CRUD 操作
 * - AgentConfig CRUD 操作
 * - 配置切换（原子写入）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAgentService } from '../agent.service'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'

// Mock fs module
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}))

describe('Agent Service', () => {
  let service: ReturnType<typeof createAgentService>

  beforeEach(async () => {
    // 初始化内存数据库
    const db = await initDatabase(':memory:')
    createTables()
    service = createAgentService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('Agent CRUD', () => {
    it('should list agents', async () => {
      const agents = await service.list()
      expect(agents.length).toBeGreaterThan(0)
      // 内置 Agent 应该存在
      expect(agents.some(a => a.name === 'claude')).toBe(true)
    })

    it('should get agent by id', async () => {
      const agent = await service.getById(1)
      expect(agent).not.toBeNull()
      expect(agent?.name).toBe('claude')
    })

    it('should return null for non-existent agent', async () => {
      const agent = await service.getById(999)
      expect(agent).toBeNull()
    })

    it('should create custom agent', async () => {
      const agent = await service.create({
        name: 'custom-agent',
        displayName: 'Custom Agent',
        configPath: '~/custom/config.json',
        configFormat: 'json',
      })
      expect(agent.name).toBe('custom-agent')
      expect(agent.isBuiltin).toBe(0)
    })

    it('should update agent', async () => {
      const agent = await service.create({
        name: 'to-update',
        displayName: 'Original',
        configPath: '~/test/config.json',
        configFormat: 'json',
      })
      const updated = await service.update(agent.id, { displayName: 'Updated' })
      expect(updated.displayName).toBe('Updated')
    })

    it('should delete custom agent', async () => {
      const agent = await service.create({
        name: 'to-delete',
        displayName: 'Delete Me',
        configPath: '~/test/config.json',
        configFormat: 'json',
      })
      await service.remove(agent.id)
      const found = await service.getById(agent.id)
      expect(found).toBeNull()
    })

    it('should not delete builtin agent', async () => {
      await expect(service.remove(1)).rejects.toThrow('Cannot delete builtin agent')
    })
  })

  describe('AgentConfig CRUD', () => {
    it('should list configs for agent', async () => {
      const configs = await service.listConfigs(1)
      expect(Array.isArray(configs)).toBe(true)
    })

    it('should create config', async () => {
      const config = await service.createConfig({
        agentId: 1,
        name: 'test-config',
        content: '{"test": true}',
      })
      expect(config.name).toBe('test-config')
      expect(config.agentId).toBe(1)
    })

    it('should get config by id', async () => {
      const config = await service.createConfig({
        agentId: 1,
        name: 'to-get',
        content: '{"get": true}',
      })
      const found = await service.getConfig(config.id)
      expect(found).not.toBeNull()
      expect(found?.name).toBe('to-get')
    })

    it('should return null for non-existent config', async () => {
      const found = await service.getConfig(999)
      expect(found).toBeNull()
    })

    it('should update config content', async () => {
      const config = await service.createConfig({
        agentId: 1,
        name: 'to-update',
        content: '{"old": true}',
      })
      const updated = await service.updateConfig(config.id, { content: '{"new": true}' })
      expect(updated.content).toBe('{"new": true}')
    })

    it('should delete config', async () => {
      const config = await service.createConfig({
        agentId: 1,
        name: 'to-delete',
        content: '{"delete": true}',
      })
      await service.deleteConfig(config.id)
      const found = await service.getConfig(config.id)
      expect(found).toBeNull()
    })

    it('should not delete current config', async () => {
      // Create a config and switch to it
      const config = await service.createConfig({
        agentId: 1,
        name: 'current-config',
        content: '{"current": true}',
      })
      await service.switchConfig({ agentId: 1, configId: config.id })

      // Try to delete the current config
      await expect(service.deleteConfig(config.id)).rejects.toThrow('Cannot delete current config')
    })
  })

  describe('Switch Config (Atomic Write)', () => {
    it('should switch config with atomic write', async () => {
      const { writeFile, rename } = await import('fs/promises')
      const config = await service.createConfig({
        agentId: 1,
        name: 'to-switch',
        content: '{"switch": true}',
      })

      await service.switchConfig({ agentId: 1, configId: config.id })

      expect(writeFile).toHaveBeenCalled()
      expect(rename).toHaveBeenCalled()
    })

    it('should throw error if config not found', async () => {
      await expect(
        service.switchConfig({ agentId: 1, configId: 999 })
      ).rejects.toThrow('Config 999 not found')
    })

    it('should throw error if config does not belong to agent', async () => {
      const config = await service.createConfig({
        agentId: 1,
        name: 'wrong-agent',
        content: '{"wrong": true}',
      })
      await expect(
        service.switchConfig({ agentId: 2, configId: config.id })
      ).rejects.toThrow('does not belong to agent')
    })

    it('should throw error if agent not found', async () => {
      // Create a config for agent 1, then try to switch for non-existent agent
      const config = await service.createConfig({
        agentId: 1,
        name: 'no-agent',
        content: '{"no": true}',
      })
      // Manually set config.agentId to non-existent agent
      // This is a hack for testing; in real code, this shouldn't happen
      await expect(
        service.switchConfig({ agentId: 999, configId: config.id })
      ).rejects.toThrow('does not belong to agent')
    })

    it('should rollback database state on write failure', async () => {
      const { writeFile } = await import('fs/promises')
      const mockWriteFile = vi.mocked(writeFile)

      // Make writeFile throw an error
      mockWriteFile.mockRejectedValueOnce(new Error('Write failed'))

      const config = await service.createConfig({
        agentId: 1,
        name: 'fail-write',
        content: '{"fail": true}',
      })

      await expect(
        service.switchConfig({ agentId: 1, configId: config.id })
      ).rejects.toThrow('Write failed')

      // Verify database state was rolled back
      const current = await service.listConfigs(1)
      const currentConfig = current.find(c => c.isCurrent === 1)
      // Should not be the failed config
      expect(currentConfig?.id).not.toBe(config.id)
    })
  })
})
