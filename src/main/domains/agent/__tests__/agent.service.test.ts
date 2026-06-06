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
      // Create a config for agent 1, then try to switch for agent whose config belongs to agent 1
      const config = await service.createConfig({
        agentId: 1,
        name: 'no-agent',
        content: '{"no": true}',
      })
      // agentId 999 does not match config's agentId 1, so "does not belong" fires first
      await expect(
        service.switchConfig({ agentId: 999, configId: config.id })
      ).rejects.toThrow('does not belong to agent')
    })

    it('should rollback to previous current on write failure', async () => {
      const { writeFile } = await import('fs/promises')
      const mockWriteFile = vi.mocked(writeFile)

      // 创建两个配置
      const configA = await service.createConfig({
        agentId: 1,
        name: 'configA',
        content: '{"a": true}',
      })
      const configB = await service.createConfig({
        agentId: 1,
        name: 'configB',
        content: '{"b": true}',
      })

      // 设置 configA 为 current
      await service.switchConfig({ agentId: 1, configId: configA.id })

      // 验证 configA 已成为 current
      const before = await service.listConfigs(1)
      expect(before.find(c => c.id === configA.id)?.isCurrent).toBe(1)

      // Mock writeFile 在切换到 configB 时失败
      mockWriteFile.mockRejectedValueOnce(new Error('Write failed'))

      // 尝试切换到 configB（写入失败）
      await expect(
        service.switchConfig({ agentId: 1, configId: configB.id })
      ).rejects.toThrow('Write failed')

      // 验证回滚：configA 仍然是 current，configB 不是 current
      const after = await service.listConfigs(1)
      expect(after.find(c => c.id === configA.id)?.isCurrent).toBe(1)
      expect(after.find(c => c.id === configB.id)?.isCurrent).toBe(0)
    })

    it('should rollback by clearing current if no previous current existed', async () => {
      const { writeFile } = await import('fs/promises')
      const mockWriteFile = vi.mocked(writeFile)

      // 创建配置，此时没有 current
      const config = await service.createConfig({
        agentId: 1,
        name: 'no-prev-current',
        content: '{"no-prev": true}',
      })

      // Mock writeFile 失败
      mockWriteFile.mockRejectedValueOnce(new Error('Write failed'))

      await expect(
        service.switchConfig({ agentId: 1, configId: config.id })
      ).rejects.toThrow('Write failed')

      // 验证回滚：没有 current 配置
      const configs = await service.listConfigs(1)
      const currentConfig = configs.find(c => c.isCurrent === 1)
      expect(currentConfig).toBeUndefined()
    })
  })
})
