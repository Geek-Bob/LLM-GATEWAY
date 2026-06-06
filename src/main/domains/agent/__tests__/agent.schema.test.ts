/**
 * Agent Schema Zod 验证单元测试
 *
 * 覆盖所有 agent.schema.ts 中定义的 schema：
 * - configFormatSchema: 配置文件格式枚举
 * - createAgentSchema: 创建 Agent 验证
 * - updateAgentSchema: 更新 Agent 验证
 * - createAgentConfigSchema: 创建 Agent 配置验证
 * - updateAgentConfigSchema: 更新 Agent 配置验证
 * - switchConfigSchema: 切换配置验证
 */

import { describe, it, expect } from 'vitest'
import {
  configFormatSchema,
  createAgentSchema,
  updateAgentSchema,
  createAgentConfigSchema,
  updateAgentConfigSchema,
  switchConfigSchema,
} from '../agent.schema'

describe('configFormatSchema', () => {
  it('应接受 json 格式', () => {
    expect(configFormatSchema.parse('json')).toBe('json')
  })

  it('应接受 toml 格式', () => {
    expect(configFormatSchema.parse('toml')).toBe('toml')
  })

  it('应接受 env 格式', () => {
    expect(configFormatSchema.parse('env')).toBe('env')
  })

  it('应拒绝 yaml 格式', () => {
    expect(() => configFormatSchema.parse('yaml')).toThrow()
  })

  it('应拒绝空字符串', () => {
    expect(() => configFormatSchema.parse('')).toThrow()
  })
})

describe('createAgentSchema', () => {
  const validInput = {
    name: 'my-agent',
    displayName: 'My Agent',
    configPath: '~/.my-agent/config.json',
    configFormat: 'json' as const,
  }

  it('应接受有效输入', () => {
    const result = createAgentSchema.parse(validInput)
    expect(result.name).toBe('my-agent')
    expect(result.displayName).toBe('My Agent')
  })

  it('应接受包含数字和连字符的 name', () => {
    const result = createAgentSchema.parse({ ...validInput, name: 'agent-123' })
    expect(result.name).toBe('agent-123')
  })

  it('应拒绝包含大写字母的 name', () => {
    expect(() => createAgentSchema.parse({ ...validInput, name: 'My-Agent' })).toThrow()
  })

  it('应拒绝包含特殊字符的 name', () => {
    expect(() => createAgentSchema.parse({ ...validInput, name: 'my_agent!' })).toThrow()
  })

  it('应拒绝包含空格的 name', () => {
    expect(() => createAgentSchema.parse({ ...validInput, name: 'my agent' })).toThrow()
  })

  it('应拒绝空 name', () => {
    expect(() => createAgentSchema.parse({ ...validInput, name: '' })).toThrow()
  })

  it('应拒绝空 displayName', () => {
    expect(() => createAgentSchema.parse({ ...validInput, displayName: '' })).toThrow()
  })

  it('应拒绝空 configPath', () => {
    expect(() => createAgentSchema.parse({ ...validInput, configPath: '' })).toThrow()
  })

  it('应拒绝无效的 configFormat', () => {
    expect(() => createAgentSchema.parse({ ...validInput, configFormat: 'yaml' })).toThrow()
  })

  it('应拒绝缺少必填字段', () => {
    expect(() => createAgentSchema.parse({ name: 'test' })).toThrow()
    expect(() => createAgentSchema.parse({ displayName: 'Test' })).toThrow()
    expect(() => createAgentSchema.parse({ configPath: '/path' })).toThrow()
    expect(() => createAgentSchema.parse({ configFormat: 'json' })).toThrow()
  })
})

describe('updateAgentSchema', () => {
  it('应接受部分更新（仅 displayName）', () => {
    const result = updateAgentSchema.parse({ displayName: 'Updated Name' })
    expect(result.displayName).toBe('Updated Name')
  })

  it('应接受部分更新（仅 configPath）', () => {
    const result = updateAgentSchema.parse({ configPath: '/new/path' })
    expect(result.configPath).toBe('/new/path')
  })

  it('应接受部分更新（仅 configFormat）', () => {
    const result = updateAgentSchema.parse({ configFormat: 'toml' })
    expect(result.configFormat).toBe('toml')
  })

  it('应接受空对象', () => {
    const result = updateAgentSchema.parse({})
    expect(result).toEqual({})
  })

  it('应拒绝空 displayName', () => {
    expect(() => updateAgentSchema.parse({ displayName: '' })).toThrow()
  })

  it('应拒绝空 configPath', () => {
    expect(() => updateAgentSchema.parse({ configPath: '' })).toThrow()
  })

  it('应拒绝无效 configFormat', () => {
    expect(() => updateAgentSchema.parse({ configFormat: 'yaml' })).toThrow()
  })
})

describe('createAgentConfigSchema', () => {
  const validInput = {
    agentId: 1,
    name: 'default',
    content: '{"key": "value"}',
  }

  it('应接受有效输入', () => {
    const result = createAgentConfigSchema.parse(validInput)
    expect(result.agentId).toBe(1)
    expect(result.name).toBe('default')
    expect(result.content).toBe('{"key": "value"}')
  })

  it('应接受空 content', () => {
    const result = createAgentConfigSchema.parse({ ...validInput, content: '' })
    expect(result.content).toBe('')
  })

  it('应拒绝 agentId 为 0', () => {
    expect(() => createAgentConfigSchema.parse({ ...validInput, agentId: 0 })).toThrow()
  })

  it('应拒绝 agentId 为负数', () => {
    expect(() => createAgentConfigSchema.parse({ ...validInput, agentId: -1 })).toThrow()
  })

  it('应拒绝 agentId 为小数', () => {
    expect(() => createAgentConfigSchema.parse({ ...validInput, agentId: 1.5 })).toThrow()
  })

  it('应拒绝空 name', () => {
    expect(() => createAgentConfigSchema.parse({ ...validInput, name: '' })).toThrow()
  })

  it('应拒绝缺少必填字段', () => {
    expect(() => createAgentConfigSchema.parse({ agentId: 1 })).toThrow()
    expect(() => createAgentConfigSchema.parse({ name: 'test' })).toThrow()
    expect(() => createAgentConfigSchema.parse({ content: '{}' })).toThrow()
  })
})

describe('updateAgentConfigSchema', () => {
  it('应接受有效 content', () => {
    const result = updateAgentConfigSchema.parse({ content: '{"new": true}' })
    expect(result.content).toBe('{"new": true}')
  })

  it('应接受空 content', () => {
    const result = updateAgentConfigSchema.parse({ content: '' })
    expect(result.content).toBe('')
  })

  it('应拒绝缺少 content 字段', () => {
    expect(() => updateAgentConfigSchema.parse({})).toThrow()
  })
})

describe('switchConfigSchema', () => {
  it('应接受有效输入', () => {
    const result = switchConfigSchema.parse({ agentId: 1, configId: 2 })
    expect(result.agentId).toBe(1)
    expect(result.configId).toBe(2)
  })

  it('应拒绝 agentId 为 0', () => {
    expect(() => switchConfigSchema.parse({ agentId: 0, configId: 1 })).toThrow()
  })

  it('应拒绝 configId 为 0', () => {
    expect(() => switchConfigSchema.parse({ agentId: 1, configId: 0 })).toThrow()
  })

  it('应拒绝 agentId 为负数', () => {
    expect(() => switchConfigSchema.parse({ agentId: -1, configId: 1 })).toThrow()
  })

  it('应拒绝 configId 为负数', () => {
    expect(() => switchConfigSchema.parse({ agentId: 1, configId: -1 })).toThrow()
  })

  it('应拒绝缺少必填字段', () => {
    expect(() => switchConfigSchema.parse({ agentId: 1 })).toThrow()
    expect(() => switchConfigSchema.parse({ configId: 1 })).toThrow()
    expect(() => switchConfigSchema.parse({})).toThrow()
  })
})
