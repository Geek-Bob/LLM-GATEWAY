// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock electron.ipcMain，捕获 IPC handler 注册以便集成测试直接调用 handler
const handlerRegistry = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlerRegistry.set(channel, handler)
    },
  },
  // core/debug-log.ts 经 createServer 链路 import app；提供 dev 模式 stub
  // 使 getDebugLogPath 守卫（typeof app.isPackaged !== 'boolean'）放行走 dev 分支
  app: {
    isPackaged: false,
    getAppPath: () => 'E:/code/llm-gateway',
    getPath: () => 'E:/code/llm-gateway'
  }
}))

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
import { registerPricingHandlers } from '../pricing'
import { registerLogHandlers } from '../logs'

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
    // 注册 IPC handler 到 mock 的 ipcMain，集成测试通过 handlerRegistry 直接调用
    registerPricingHandlers(getDb())
    registerLogHandlers(getDb())
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

  type PricingItem = {
    providerId: number
    model: string
    priceInCached: number
    priceInUncached: number
    priceOut: number
  }

  describe('Pricing IPC handlers', () => {
    let providerId: number

    beforeAll(async () => {
      // provider_pricing 外键引用 providers(id)，需先建供应商
      const repo = createProviderRepository(getDb())
      const created = await repo.create({
        name: 'Pricing Test Provider',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-pricing-test',
        models: ['gpt-4']
      })
      providerId = created.id
    })

    it('pricing:upsert 写入正常输入应返回 PricingResponse', async () => {
      const upsert = handlerRegistry.get('pricing:upsert')!
      const result = (await upsert({}, {
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })) as PricingItem
      expect(result).toMatchObject({
        providerId,
        model: 'gpt-4',
        priceInCached: 0.5,
        priceInUncached: 1.5,
        priceOut: 3.0
      })
    })

    it('pricing:list 应包含已写入的记录', async () => {
      const list = handlerRegistry.get('pricing:list')!
      const result = (await list({})) as PricingItem[]
      expect(result.some(p => p.providerId === providerId && p.model === 'gpt-4')).toBe(true)
    })

    it('pricing:getByProvider 应返回该供应商的记录', async () => {
      const getByProvider = handlerRegistry.get('pricing:getByProvider')!
      // getByProvider 传裸 providerId 数字（非对象），与 preload ipcRenderer.invoke 一致
      const result = (await getByProvider({}, providerId)) as PricingItem[]
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result.every(p => p.providerId === providerId)).toBe(true)
    })

    it('pricing:upsert 重复调用应幂等更新而非新增', async () => {
      const upsert = handlerRegistry.get('pricing:upsert')!
      const list = handlerRegistry.get('pricing:list')!
      const before = (await list({})) as PricingItem[]
      const countBefore = before.filter(p => p.providerId === providerId && p.model === 'gpt-4').length

      await upsert({}, {
        providerId,
        model: 'gpt-4',
        priceInCached: 0.8,
        priceInUncached: 1.8,
        priceOut: 3.5
      })

      const after = (await list({})) as PricingItem[]
      const countAfter = after.filter(p => p.providerId === providerId && p.model === 'gpt-4').length
      expect(countAfter).toBe(countBefore)
      const updated = after.find(p => p.providerId === providerId && p.model === 'gpt-4')!
      expect(updated.priceInCached).toBe(0.8)
      expect(updated.priceOut).toBe(3.5)
    })

    it('pricing:upsert 负单价应返回 Invalid input 错误', async () => {
      const upsert = handlerRegistry.get('pricing:upsert')!
      const result = (await upsert({}, {
        providerId,
        model: 'gpt-4',
        priceInCached: -1,
        priceInUncached: 1.5,
        priceOut: 3.0
      })) as { error: string }
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect(result.error).toContain('priceInCached')
    })

    it('pricing:upsert 缺字段应返回 Invalid input 错误', async () => {
      const upsert = handlerRegistry.get('pricing:upsert')!
      const result = await upsert({}, { providerId, model: 'gpt-4' })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })

    it('pricing:delete 应删除记录', async () => {
      const del = handlerRegistry.get('pricing:delete')!
      const getByProvider = handlerRegistry.get('pricing:getByProvider')!
      await del({}, { providerId, model: 'gpt-4' })
      const result = (await getByProvider({}, providerId)) as PricingItem[]
      expect(result.some(p => p.model === 'gpt-4')).toBe(false)
    })

    it('pricing:delete 非法输入（缺 model）应返回 Invalid input 错误', async () => {
      const del = handlerRegistry.get('pricing:delete')!
      const result = await del({}, { providerId })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })
  })

  describe('logs:rangeSummary IPC handler', () => {
    it("logs:rangeSummary('24h') 应返回 RangeSummary 结构", async () => {
      const handler = handlerRegistry.get('logs:rangeSummary')!
      const result = await handler({}, '24h')
      expect(result).toMatchObject({
        totalTokens: expect.any(Number),
        inputTokens: expect.any(Number),
        cacheTokens: expect.any(Number),
        uncachedTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalCost: expect.any(Number),
        cacheCost: expect.any(Number),
        uncachedCost: expect.any(Number),
        outputCost: expect.any(Number),
        totalRequests: expect.any(Number)
      })
    })

    it("logs:rangeSummary('30d') 无日志时应返回零值汇总", async () => {
      const handler = handlerRegistry.get('logs:rangeSummary')!
      const result = await handler({}, '30d')
      expect(result).toMatchObject({
        totalTokens: 0,
        totalRequests: 0,
        totalCost: 0
      })
    })

    it("logs:rangeSummary('7d') 不在合法枚举内应返回 Invalid input", async () => {
      const handler = handlerRegistry.get('logs:rangeSummary')!
      const result = await handler({}, '7d')
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })

    it('logs:rangeSummary 缺参数应返回 Invalid input', async () => {
      const handler = handlerRegistry.get('logs:rangeSummary')!
      const result = await handler({}, undefined)
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })
  })
})
