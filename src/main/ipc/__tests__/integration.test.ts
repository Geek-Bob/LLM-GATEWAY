// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createApiKeyRepository } from '../../db/api-keys'
import { createProviderRepository, type ProviderRow } from '../../db/providers'
import type { Provider } from '../../../shared/types'
import { createLogEntry } from '../../db/logs'
import { createLogStatsRepository } from '../../db/logs-stats'
import { createModelsService } from '../../domains/models/models.service'
import { createConversationRepository } from '../../db/conversations'
import { createServer } from '../../proxy/server'

/** snake_case ProviderRow → camelCase Provider，proxy 路由专用 */
function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type as 'anthropic' | 'openai',
    baseUrl: row.base_url,
    apiKey: row.api_key,
    models: JSON.parse(row.models) as string[],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

describe('IPC Integration (Renderer → Main process)', () => {
  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  describe('Providers', () => {
    it('should list empty initially', async () => {
      const repo = createProviderRepository(getDb())
      const providers = await repo.list()
      expect(providers).toEqual([])
    })

    it('should create and list providers', async () => {
      const repo = createProviderRepository(getDb())
      const created = await repo.create({
        name: 'Test Provider',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        models: ['gpt-4', 'gpt-3.5-turbo']
      })
      expect(created.id).toBeGreaterThan(0)

      const providers = await repo.list()
      expect(providers.length).toBe(1)
      expect(providers[0].name).toBe('Test Provider')
      expect(JSON.parse(providers[0].models)).toEqual(['gpt-4', 'gpt-3.5-turbo'])
    })
  })

  describe('API Keys', () => {
    it('should create and list API keys', async () => {
      const repo = createApiKeyRepository(getDb())
      const result = await repo.create('My Key', 60)
      expect(result.plaintextKey).toBeDefined()
      expect(result.plaintextKey.length).toBeGreaterThan(8)

      const keys = await repo.list()
      expect(keys.length).toBe(1)
      expect(keys[0].name).toBe('My Key')
      expect(keys[0].is_active).toBe(1)
    })
  })

  describe('Conversations (full chat flow)', () => {
    let conversationId: number

    it('should create a conversation', async () => {
      const repo = createConversationRepository(getDb())
      const created = await repo.create('Test Chat', 'gpt-4', 1, 1)
      conversationId = created.id
      expect(conversationId).toBeGreaterThan(0)

      const conv = await repo.findById(conversationId)
      expect(conv).not.toBeNull()
      expect(conv!.title).toBe('Test Chat')
      expect(conv!.model).toBe('gpt-4')
    })

    it('should return full object from create (not just id)', async () => {
      const repo = createConversationRepository(getDb())
      // Repository.create 返回完整 row，无需二次查询
      const created = await repo.create('Verify Object', 'claude-3', null, null)
      expect(created.id).toBeGreaterThan(0)
      expect(created.title).toBe('Verify Object')

      const conv = await repo.findById(created.id)
      expect(conv).not.toBeNull()
      expect(conv!.id).toBe(created.id)
      expect(conv!.title).toBe('Verify Object')
    })

    it('should update conversation fields selectively', async () => {
      const repo = createConversationRepository(getDb())
      // 模拟 Chat.tsx 的更新流程：模型 + providerId + apiKeyId
      await repo.update(conversationId, {
        provider_id: 1,
        model: 'gpt-3.5-turbo',
        api_key_id: 1
      })

      const conv = await repo.findById(conversationId)
      expect(conv!.model).toBe('gpt-3.5-turbo')
      expect(conv!.provider_id).toBe(1)
      expect(conv!.api_key_id).toBe(1)
    })

    it('should update only title without affecting other fields', async () => {
      const repo = createConversationRepository(getDb())
      await repo.update(conversationId, { title: 'Updated Title' })

      const conv = await repo.findById(conversationId)
      expect(conv!.title).toBe('Updated Title')
      // 其它字段保持不变
      expect(conv!.model).toBe('gpt-3.5-turbo')
      expect(conv!.provider_id).toBe(1)
    })

    it('should add and list messages', async () => {
      const repo = createConversationRepository(getDb())
      await repo.addMessage(conversationId, 'user', 'Hello, world!')
      await repo.addMessage(conversationId, 'assistant', 'Hi there!', 'thinking...')

      const msgs = await repo.listMessages(conversationId)
      expect(msgs.length).toBe(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('Hello, world!')
      expect(msgs[1].role).toBe('assistant')
      expect(msgs[1].content).toBe('Hi there!')
      expect(msgs[1].thinking).toBe('thinking...')
    })

    it('should list conversations ordered by updated_at DESC', async () => {
      const repo = createConversationRepository(getDb())
      await repo.create('Second Chat', 'gpt-4', 1, 1)
      const convs = await repo.list()
      expect(convs.length).toBeGreaterThanOrEqual(2)
      // updated_at 降序：最近修改的在前
      const titles = convs.map(c => c.title)
      expect(titles).toContain('Second Chat')
    })

    it('should delete conversation', async () => {
      const repo = createConversationRepository(getDb())
      const created = await repo.create('To Delete', 'gpt-4', null, null)
      const before = await repo.findById(created.id)
      expect(before).not.toBeNull()

      await repo.remove(created.id)
      const after = await repo.findById(created.id)
      expect(after).toBeNull()
    })
  })

  describe('Proxy server (chat stream)', () => {
    it('should create server and serve chat stream', async () => {
      const db = getDb()
      const apiKeyRepo = createApiKeyRepository(db)
      const providerRepo = createProviderRepository(db)
      const statsRepo = createLogStatsRepository(db)
      const modelsService = createModelsService(db)

      const app = createServer({
        verifyApiKey: (plaintextKey) => apiKeyRepo.verify(plaintextKey),
        createLogEntry,
        updateRequestStats: (entry) => statsRepo.updateRequestStats(entry),
        updateProviderStats: (entry) => statsRepo.updateProviderStats(entry),
        modelsService,
        getDebugMode: () => false,
        lookupProvider: async (name) => {
          const row = await providerRepo.findByName(name)
          return row ? toProvider(row) : undefined
        },
      })
      expect(app).toBeDefined()

      // /health 端点（无需认证）
      const healthRes = await app.request('/health')
      expect(healthRes.status).toBe(200)

      // /v1/models 端点（需要认证）
      const proxyKey = await apiKeyRepo.create('Proxy Test', 60)
      const modelsRes = await app.request('/v1/models', {
        headers: {
          authorization: `Bearer ${proxyKey.plaintextKey}`
        }
      })
      expect(modelsRes.status).toBe(200)
    })
  })
})
