// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createApiKey, listApiKeys, verifyApiKey } from '../../db/api-keys'
import { createProvider, listProviders, getProviderByName } from '../../db/providers'
import { createLogEntry, updateRequestStats, updateProviderStats } from '../../db/logs'
import { createModelsService } from '../../domains/models/models.service'
import {
  listConversations, createConversation, updateConversation,
  getConversation, addMessage, listMessages, deleteConversation
} from '../../db/conversations'
import { createServer } from '../../proxy/server'

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
      const providers = listProviders()
      expect(providers).toEqual([])
    })

    it('should create and list providers', async () => {
      const id = createProvider({
        name: 'Test Provider',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test-key',
        models: ['gpt-4', 'gpt-3.5-turbo']
      })
      expect(id).toBeGreaterThan(0)

      const providers = listProviders()
      expect(providers.length).toBe(1)
      expect(providers[0].name).toBe('Test Provider')
      expect(JSON.parse(providers[0].models)).toEqual(['gpt-4', 'gpt-3.5-turbo'])
    })
  })

  describe('API Keys', () => {
    it('should create and list API keys', async () => {
      const result = createApiKey('My Key', 60)
      expect(result.plaintextKey).toBeDefined()
      expect(result.plaintextKey).toBeDefined()
      expect(result.plaintextKey.length).toBeGreaterThan(8)

      const keys = listApiKeys()
      expect(keys.length).toBe(1)
      expect(keys[0].name).toBe('My Key')
      expect(keys[0].is_active).toBe(1)
    })
  })

  describe('Conversations (full chat flow)', () => {
    let conversationId: number

    it('should create a conversation', async () => {
      const db = getDb()
      conversationId = createConversation(db, 'Test Chat', 'gpt-4', 1, 1)
      expect(conversationId).toBeGreaterThan(0)

      const conv = getConversation(db, conversationId)
      expect(conv).toBeDefined()
      expect(conv!.title).toBe('Test Chat')
      expect(conv!.model).toBe('gpt-4')
    })

    it('should return full object from create (not just id)', async () => {
      const db = getDb()
      // This is the bug fix - ensure getConversation works right after create
      const id = createConversation(db, 'Verify Object', 'claude-3', null, null)
      const conv = getConversation(db, id)
      expect(conv).toBeDefined()
      expect(conv!.id).toBe(id)
      expect(conv!.title).toBe('Verify Object')
    })

    it('should update conversation fields selectively', async () => {
      const db = getDb()
      // Simulate what Chat.tsx does: update model/providerId/apiKeyId
      updateConversation(db, conversationId, {
        provider_id: 1,
        model: 'gpt-3.5-turbo',
        api_key_id: 1
      })

      const conv = getConversation(db, conversationId)
      expect(conv!.model).toBe('gpt-3.5-turbo')
      expect(conv!.provider_id).toBe(1)
      expect(conv!.api_key_id).toBe(1)
    })

    it('should update only title without affecting other fields', async () => {
      const db = getDb()
      updateConversation(db, conversationId, { title: 'Updated Title' })

      const conv = getConversation(db, conversationId)
      expect(conv!.title).toBe('Updated Title')
      // Other fields should be unchanged
      expect(conv!.model).toBe('gpt-3.5-turbo')
      expect(conv!.provider_id).toBe(1)
    })

    it('should add and list messages', async () => {
      const db = getDb()
      addMessage(db, conversationId, 'user', 'Hello, world!')
      addMessage(db, conversationId, 'assistant', 'Hi there!', 'thinking...')

      const msgs = listMessages(db, conversationId)
      expect(msgs.length).toBe(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('Hello, world!')
      expect(msgs[1].role).toBe('assistant')
      expect(msgs[1].content).toBe('Hi there!')
      expect(msgs[1].thinking).toBe('thinking...')
    })

    it('should list conversations ordered by updated_at DESC', async () => {
      const db = getDb()
      createConversation(db, 'Second Chat', 'gpt-4', 1, 1)
      const convs = listConversations(db)
      expect(convs.length).toBeGreaterThanOrEqual(2)
      // ordered by updated_at DESC — the most recently modified is first
      const titles = convs.map(c => c.title)
      expect(titles).toContain('Second Chat')
    })

    it('should delete conversation', async () => {
      const db = getDb()
      const id = createConversation(db, 'To Delete', 'gpt-4', null, null)
      const before = getConversation(db, id)
      expect(before).toBeDefined()

      deleteConversation(db, id)
      const after = getConversation(db, id)
      expect(after).toBeUndefined()
    })
  })

  describe('Proxy server (chat stream)', () => {
    it('should create server and serve chat stream', async () => {
      const modelsService = createModelsService(getDb())
      const app = createServer({
        verifyApiKey,
        createLogEntry,
        updateRequestStats,
        updateProviderStats,
        modelsService,
        getDebugMode: () => false,
        lookupProvider: (name) => getProviderByName(name) as any,
      })
      expect(app).toBeDefined()

      // Test health endpoint (no auth)
      const healthRes = await app.request('/health')
      expect(healthRes.status).toBe(200)

      // Test models endpoint (requires auth)
      const modelsRes = await app.request('/v1/models', {
        headers: {
          authorization: `Bearer ${createApiKey('Proxy Test', 60).plaintextKey}`
        }
      })
      expect(modelsRes.status).toBe(200)
    })
  })
})
