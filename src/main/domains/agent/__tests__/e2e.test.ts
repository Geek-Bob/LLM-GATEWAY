/**
 * Agent 配置管理端到端测试
 *
 * 验证完整的 Agent 配置管理工作流，包括：
 * - 列出内置 Agent → 创建配置 → 切换配置 → 验证当前配置
 * - 同一 Agent 多配置切换
 * - 自定义 Agent 全流程
 * - 内置 Agent 不可删除
 * - 当前配置不可删除
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAgentService } from '../agent.service'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'

// Mock fs module（原子写入文件系统操作）
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}))

describe('Agent Config E2E', () => {
  let service: ReturnType<typeof createAgentService>

  beforeEach(async () => {
    // 初始化内存数据库 + 建表（含内置 Agent 预设）
    const db = await initDatabase(':memory:')
    createTables()
    service = createAgentService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should complete full workflow: list agents, create config, switch', async () => {
    // 1. 列出所有 Agent，确认内置 claude 存在
    const agents = await service.list()
    expect(agents.length).toBeGreaterThan(0)
    const claude = agents.find(a => a.name === 'claude')
    expect(claude).toBeDefined()

    // 2. 为 claude 创建一个 work 配置
    const config = await service.createConfig({
      agentId: claude!.id,
      name: 'work',
      content: JSON.stringify({
        env: {
          ANTHROPIC_API_KEY: 'sk-work-key',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
      }),
    })
    expect(config.name).toBe('work')

    // 3. 切换到该配置
    await service.switchConfig({
      agentId: claude!.id,
      configId: config.id,
    })

    // 4. 验证该配置已成为当前配置
    const configs = await service.listConfigs(claude!.id)
    const currentConfig = configs.find(c => c.isCurrent === 1)
    expect(currentConfig?.id).toBe(config.id)

    // 5. 验证文件系统原子写入被调用，包含正确的路径模式和内容
    const { writeFile, rename, mkdir } = await import('fs/promises')
    expect(mkdir).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp.'),
      config.content,
      'utf-8'
    )
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp.'),
      expect.stringContaining('settings.json')
    )
  })

  it('should support multiple configs per agent', async () => {
    const agents = await service.list()
    const claude = agents.find(a => a.name === 'claude')!

    // 创建三个配置
    const config1 = await service.createConfig({
      agentId: claude.id,
      name: 'default',
      content: '{"env": {"key": "default"}}',
    })
    const config2 = await service.createConfig({
      agentId: claude.id,
      name: 'work',
      content: '{"env": {"key": "work"}}',
    })
    const config3 = await service.createConfig({
      agentId: claude.id,
      name: 'personal',
      content: '{"env": {"key": "personal"}}',
    })

    // 验证三个配置都已创建
    const configs = await service.listConfigs(claude.id)
    expect(configs.length).toBe(3)

    // 依次切换并验证当前配置
    await service.switchConfig({ agentId: claude.id, configId: config1.id })
    let current = (await service.listConfigs(claude.id)).find(c => c.isCurrent === 1)
    expect(current?.name).toBe('default')

    await service.switchConfig({ agentId: claude.id, configId: config2.id })
    current = (await service.listConfigs(claude.id)).find(c => c.isCurrent === 1)
    expect(current?.name).toBe('work')

    await service.switchConfig({ agentId: claude.id, configId: config3.id })
    current = (await service.listConfigs(claude.id)).find(c => c.isCurrent === 1)
    expect(current?.name).toBe('personal')
  })

  it('should support custom agents', async () => {
    // 创建自定义 Agent
    const customAgent = await service.create({
      name: 'my-cli',
      displayName: 'My CLI Tool',
      configPath: '~/.my-cli/config.json',
      configFormat: 'json',
    })

    expect(customAgent.isBuiltin).toBe(0)
    expect(customAgent.name).toBe('my-cli')

    // 为自定义 Agent 创建配置
    const config = await service.createConfig({
      agentId: customAgent.id,
      name: 'default',
      content: '{"api_key": "test"}',
    })

    // 切换配置
    await service.switchConfig({
      agentId: customAgent.id,
      configId: config.id,
    })

    // 验证当前配置
    const current = (await service.listConfigs(customAgent.id)).find(c => c.isCurrent === 1)
    expect(current?.id).toBe(config.id)
  })

  it('should not allow deleting builtin agents', async () => {
    const agents = await service.list()
    const builtin = agents.find(a => a.isBuiltin === 1)

    await expect(service.remove(builtin!.id)).rejects.toThrow('Failed to delete agent: cannot delete builtin agent')
  })

  it('should not allow deleting current config', async () => {
    const agents = await service.list()
    const claude = agents.find(a => a.name === 'claude')!

    const config = await service.createConfig({
      agentId: claude.id,
      name: 'to-delete',
      content: '{}',
    })

    // 设为当前配置
    await service.switchConfig({ agentId: claude.id, configId: config.id })

    // 尝试删除当前配置，应抛出错误
    await expect(service.deleteConfig(config.id)).rejects.toThrow('Failed to delete config: cannot delete current config')
  })

  it('should rollback to previous current on write failure', async () => {
    const { writeFile } = await import('fs/promises')
    const mockWriteFile = vi.mocked(writeFile)

    const agents = await service.list()
    const claude = agents.find(a => a.name === 'claude')!

    // 创建两个配置
    const configA = await service.createConfig({
      agentId: claude.id,
      name: 'configA',
      content: '{"a": true}',
    })
    const configB = await service.createConfig({
      agentId: claude.id,
      name: 'configB',
      content: '{"b": true}',
    })

    // 先切换到 configA（成功）
    await service.switchConfig({ agentId: claude.id, configId: configA.id })

    // 设置下次写入失败
    mockWriteFile.mockRejectedValueOnce(new Error('Write failed'))

    // 切换到 configB 应该失败
    await expect(service.switchConfig({ agentId: claude.id, configId: configB.id }))
      .rejects.toThrow('Write failed')

    // 验证回滚：configA 仍然是当前配置
    const configs = await service.listConfigs(claude.id)
    const current = configs.find(c => c.isCurrent === 1)
    expect(current?.id).toBe(configA.id)
  })

  it('should throw error for non-existent config', async () => {
    const agents = await service.list()
    const claude = agents.find(a => a.name === 'claude')!

    await expect(service.switchConfig({ agentId: claude.id, configId: 999 }))
      .rejects.toThrow('Failed to switch config: config 999 not found')
  })

  it('should throw error when config does not belong to agent', async () => {
    const agents = await service.list()
    const claude = agents.find(a => a.name === 'claude')!
    const codex = agents.find(a => a.name === 'codex')!

    const config = await service.createConfig({
      agentId: claude.id,
      name: 'test',
      content: '{}',
    })

    await expect(service.switchConfig({ agentId: codex.id, configId: config.id }))
      .rejects.toThrow('does not belong to agent')
  })
})
