// @vitest-environment node
/**
 * 业务数据 4 表 clearAll() 验收测试
 *
 * 验收标准：
 * - providerRepo.clearAll() 后 providers 表计数为 0
 * - modelMappingRepo.clearAll() 后 model_mappings 表计数为 0
 * - apiKeyRepo.clearAll() 后 api_keys 表计数为 0
 * - conversationRepo.clearAll() 后 conversations 表计数为 0，且 messages 表通过
 *   FOREIGN KEY ... ON DELETE CASCADE 自动级联清空
 * - 四个方法均为 async、返回 Promise<void>、配 JSDoc（JSDoc 由人工审查）
 *
 * 测试使用内存数据库（sql.js WASM），不 mock 数据库操作。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import { createProviderRepository } from '../providers'
import { createModelMappingRepository } from '../model-mappings'
import { createApiKeyRepository } from '../api-keys'
import { createConversationRepository } from '../conversations'
import type { ProviderInput } from '../providers'

/** 查询指定表的行数 */
function countRows(table: string): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }
  return row.cnt
}

describe('Repository.clearAll() — 业务数据 4 表批量清空', () => {
  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    // 同时实例化 4 个 Repository，确保 db 注入路径与生产一致
    createProviderRepository(db)
    createModelMappingRepository(db)
    createApiKeyRepository(db)
    createConversationRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('providerRepo.clearAll() 清空 providers 表', async () => {
    const repo = createProviderRepository(getDb())
    const input: ProviderInput = {
      name: 'p1',
      providerType: 'openai',
      baseUrl: 'https://a.test',
      apiKey: 'sk-a',
      models: ['gpt-4']
    }
    // 插入 3 条（第 2、3 条用不同 name 避开 UNIQUE 约束）
    await repo.create(input)
    await repo.create({ ...input, name: 'p2', apiKey: 'sk-b' })
    await repo.create({ ...input, name: 'p3', apiKey: 'sk-c' })
    expect(countRows('providers')).toBe(3)

    await repo.clearAll()

    expect(countRows('providers')).toBe(0)
  })

  it('modelMappingRepo.clearAll() 清空 model_mappings 表', async () => {
    const repo = createModelMappingRepository(getDb())
    await repo.create('src-a', 'tgt-a')
    await repo.create('src-b', 'tgt-b')
    expect(countRows('model_mappings')).toBe(2)

    await repo.clearAll()

    expect(countRows('model_mappings')).toBe(0)
  })

  it('apiKeyRepo.clearAll() 清空 api_keys 表', async () => {
    const repo = createApiKeyRepository(getDb())
    await repo.create('key-1')
    await repo.create('key-2')
    await repo.create('key-3')
    expect(countRows('api_keys')).toBe(3)

    await repo.clearAll()

    expect(countRows('api_keys')).toBe(0)
  })

  it('conversationRepo.clearAll() 清空 conversations 表，并级联清空 messages 表', async () => {
    const repo = createConversationRepository(getDb())
    // 创建 2 个会话，每个会话添加 2 条消息
    const c1 = await repo.create('conv-1', 'gpt-4')
    const c2 = await repo.create('conv-2', 'claude-3')
    await repo.addMessage(c1.id, 'user', 'hello-1')
    await repo.addMessage(c1.id, 'assistant', 'world-1')
    await repo.addMessage(c2.id, 'user', 'hello-2')
    await repo.addMessage(c2.id, 'assistant', 'world-2')

    expect(countRows('conversations')).toBe(2)
    expect(countRows('messages')).toBe(4)

    await repo.clearAll()

    // conversations 主表清零
    expect(countRows('conversations')).toBe(0)
    // messages 通过 ON DELETE CASCADE 自动级联清空（外键约束已在 Database.create 中启用）
    expect(countRows('messages')).toBe(0)
  })

  it('clearAll() 对空表也是幂等的（无数据时不报错）', async () => {
    // 各表初始即空，clearAll 应正常返回
    await expect(createProviderRepository(getDb()).clearAll()).resolves.toBeUndefined()
    await expect(createModelMappingRepository(getDb()).clearAll()).resolves.toBeUndefined()
    await expect(createApiKeyRepository(getDb()).clearAll()).resolves.toBeUndefined()
    await expect(createConversationRepository(getDb()).clearAll()).resolves.toBeUndefined()

    expect(countRows('providers')).toBe(0)
    expect(countRows('model_mappings')).toBe(0)
    expect(countRows('api_keys')).toBe(0)
    expect(countRows('conversations')).toBe(0)
    expect(countRows('messages')).toBe(0)
  })
})
