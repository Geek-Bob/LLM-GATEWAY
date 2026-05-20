// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getConversation,
  listMessages,
  addMessage
} from '../conversations'
import type { ConversationRow, MessageRow } from '../conversations'
import crypto from 'crypto'
import { getApiKeyById } from '../api-keys'

describe('Conversations schema', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should create conversations table', () => {
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('conversations')
  })

  it('should create messages table', () => {
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .get() as { name: string } | undefined

    expect(row).toBeDefined()
    expect(row!.name).toBe('messages')
  })

  it('should have correct conversations columns', () => {
    const columns = getDb()
      .prepare("PRAGMA table_info('conversations')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('title')
    expect(colNames).toContain('provider_id')
    expect(colNames).toContain('model')
    expect(colNames).toContain('api_key_id')
    expect(colNames).toContain('created_at')
    expect(colNames).toContain('updated_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should have correct messages columns', () => {
    const columns = getDb()
      .prepare("PRAGMA table_info('messages')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('conversation_id')
    expect(colNames).toContain('role')
    expect(colNames).toContain('content')
    expect(colNames).toContain('thinking')
    expect(colNames).toContain('created_at')

    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol!.pk).toBe(1)
  })

  it('should enforce CHECK constraint on messages.role', () => {
    expect(() => {
      getDb()
        .prepare("INSERT INTO messages (conversation_id, role, content) VALUES (1, 'invalid_role', 'test')")
        .run()
    }).toThrow()
  })
})

describe('Conversations CRUD', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should create a conversation and return a positive id', () => {
    const id = createConversation('Test Conversation', 'gpt-4')
    expect(id).toBeGreaterThan(0)
    expect(Number.isInteger(id)).toBe(true)
  })

  it('should create conversation with default title', () => {
    const id = createConversation('', 'gpt-4')
    const conv = getConversation(id)!
    expect(conv.title).toBe('')
  })

  it('should create conversation with provider_id and api_key_id', () => {
    const id = createConversation('Test', 'gpt-4', 1, 2)
    const conv = getConversation(id)!
    expect(conv.provider_id).toBe(1)
    expect(conv.api_key_id).toBe(2)
  })

  it('should create conversation with nullable provider_id and api_key_id', () => {
    const id = createConversation('Test', 'gpt-4', null, null)
    const conv = getConversation(id)!
    expect(conv.provider_id).toBeNull()
    expect(conv.api_key_id).toBeNull()
  })

  it('should get a conversation by id', () => {
    const id = createConversation('My Chat', 'claude-3-opus')

    const conv = getConversation(id)
    expect(conv).toBeDefined()
    expect(conv!.id).toBe(id)
    expect(conv!.title).toBe('My Chat')
    expect(conv!.model).toBe('claude-3-opus')
    expect(conv!.created_at).toBeTruthy()
    expect(conv!.updated_at).toBeTruthy()
  })

  it('should return undefined for non-existent conversation', () => {
    const conv = getConversation(999)
    expect(conv).toBeUndefined()
  })

  it('should list all conversations ordered by updated_at desc', async () => {
    const id1 = createConversation('Chat A', 'gpt-4')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const id2 = createConversation('Chat B', 'gpt-3.5-turbo')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const id3 = createConversation('Chat C', 'claude-3-opus')

    const convs = listConversations()
    expect(convs).toHaveLength(3)

    // Most recently updated should appear first (updated_at defaults to created_at)
    const ids = convs.map((c) => c.id)
    expect(ids).toEqual([id3, id2, id1])
  })

  it('should update conversation title', () => {
    const id = createConversation('Original Title', 'gpt-4')
    updateConversation(id, { title: 'Updated Title' })

    const conv = getConversation(id)!
    expect(conv.title).toBe('Updated Title')
    expect(conv.model).toBe('gpt-4')
  })

  it('should update conversation model', () => {
    const id = createConversation('Test', 'gpt-4')
    updateConversation(id, { model: 'gpt-4-turbo' })

    const conv = getConversation(id)!
    expect(conv.model).toBe('gpt-4-turbo')
  })

  it('should update conversation provider_id', () => {
    const id = createConversation('Test', 'gpt-4')
    updateConversation(id, { provider_id: 5 })

    const conv = getConversation(id)!
    expect(conv.provider_id).toBe(5)
  })

  it('should update conversation api_key_id', () => {
    const id = createConversation('Test', 'gpt-4')
    updateConversation(id, { api_key_id: 10 })

    const conv = getConversation(id)!
    expect(conv.api_key_id).toBe(10)
  })

  it('should set provider_id and api_key_id to null', () => {
    const id = createConversation('Test', 'gpt-4', 1, 2)
    updateConversation(id, { provider_id: null, api_key_id: null })

    const conv = getConversation(id)!
    expect(conv.provider_id).toBeNull()
    expect(conv.api_key_id).toBeNull()
  })

  it('should update updated_at on modification', async () => {
    const id = createConversation('Test', 'gpt-4')
    const original = getConversation(id)!
    const originalUpdatedAt = original.updated_at

    await new Promise((resolve) => setTimeout(resolve, 1100))

    updateConversation(id, { title: 'Updated' })
    const updated = getConversation(id)!

    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should delete a conversation', () => {
    const id = createConversation('To Delete', 'gpt-4')
    expect(getConversation(id)).toBeDefined()

    deleteConversation(id)
    expect(getConversation(id)).toBeUndefined()
  })

  it('should handle delete of non-existent id without error', () => {
    expect(() => deleteConversation(999)).not.toThrow()
  })
})

describe('Messages', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should add a message to a conversation', () => {
    const convId = createConversation('Test', 'gpt-4')
    const msgId = addMessage(convId, 'user', 'Hello!')

    expect(msgId).toBeGreaterThan(0)
    expect(Number.isInteger(msgId)).toBe(true)
  })

  it('should add messages with correct fields', () => {
    const convId = createConversation('Test', 'gpt-4')
    addMessage(convId, 'user', 'Hello')
    const msgId = addMessage(convId, 'assistant', 'Hi there!', 'thinking...')

    const messages = listMessages(convId)
    expect(messages).toHaveLength(2)

    const assistantMsg = messages.find((m) => m.role === 'assistant')!
    expect(assistantMsg.content).toBe('Hi there!')
    expect(assistantMsg.thinking).toBe('thinking...')
    expect(assistantMsg.conversation_id).toBe(convId)
  })

  it('should default thinking to empty string', () => {
    const convId = createConversation('Test', 'gpt-4')
    addMessage(convId, 'user', 'Hello')

    const messages = listMessages(convId)
    expect(messages[0].thinking).toBe('')
  })

  it('should list messages in insertion order (ASC by id)', () => {
    const convId = createConversation('Test', 'gpt-4')
    const id1 = addMessage(convId, 'user', 'First')
    const id2 = addMessage(convId, 'assistant', 'Second')
    const id3 = addMessage(convId, 'user', 'Third')

    const messages = listMessages(convId)
    expect(messages).toHaveLength(3)
    expect(messages[0].id).toBe(id1)
    expect(messages[1].id).toBe(id2)
    expect(messages[2].id).toBe(id3)
    expect(messages[0].content).toBe('First')
    expect(messages[1].content).toBe('Second')
    expect(messages[2].content).toBe('Third')
  })

  it('should return empty array for conversation with no messages', () => {
    const convId = createConversation('Test', 'gpt-4')
    const messages = listMessages(convId)
    expect(messages).toEqual([])
  })

  it('should update conversation updated_at when adding message', async () => {
    const convId = createConversation('Test', 'gpt-4')
    const originalUpdatedAt = getConversation(convId)!.updated_at

    await new Promise((resolve) => setTimeout(resolve, 1100))

    addMessage(convId, 'user', 'New message')
    const updated = getConversation(convId)!
    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should cascade delete messages when conversation is deleted', () => {
    const convId = createConversation('Test', 'gpt-4')
    addMessage(convId, 'user', 'Msg 1')
    addMessage(convId, 'user', 'Msg 2')

    expect(listMessages(convId)).toHaveLength(2)

    deleteConversation(convId)
    expect(getConversation(convId)).toBeUndefined()

    // Verify messages table no longer has these messages
    const remaining = getDb()
      .prepare('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?')
      .all(convId) as Array<{ cnt: number }>
    expect(remaining[0].cnt).toBe(0)
  })

  it('should enforce NOT NULL on messages.conversation_id', () => {
    expect(() => {
      getDb()
        .prepare("INSERT INTO messages (role, content) VALUES ('user', 'test')")
        .run()
    }).toThrow()
  })
})

describe('getApiKeyById', () => {
  beforeEach(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should return undefined for non-existent api key id', () => {
    const key = getApiKeyById(999)
    expect(key).toBeUndefined()
  })

  it('should return api key row by id', () => {
    // Create a key using the raw module
    const keyHash = crypto.createHash('sha256').update('sk-test-key').digest('hex')
    getDb().prepare(`
      INSERT INTO api_keys (name, key_prefix, key_hash, key_encrypted, rate_limit)
      VALUES (@name, @prefix, @hash, @encrypted, @rate)
    `).run({ name: 'Test Key Entry', prefix: 'sk-test-', hash: keyHash, encrypted: 'sk-test-key-plaintext', rate: 30 })

    const row = getDb().prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(keyHash) as { id: number }

    const key = getApiKeyById(row.id)
    expect(key).toBeDefined()
    expect(key!.id).toBe(row.id)
    expect(key!.name).toBe('Test Key Entry')
    expect(key!.key_prefix).toBe('sk-test-')
    expect(key!.rate_limit).toBe(30)
    expect(key!.is_active).toBe(1)
    expect(key!.created_at).toBeTruthy()
  })
})
