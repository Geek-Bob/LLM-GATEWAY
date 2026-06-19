// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import { createConversationRepository } from '../conversations'

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

describe('Conversation Repository CRUD', () => {
  let repo: ReturnType<typeof createConversationRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createConversationRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should create a conversation and return a row with positive id', async () => {
    const conv = await repo.create('Test Conversation', 'gpt-4')
    expect(conv.id).toBeGreaterThan(0)
    expect(Number.isInteger(conv.id)).toBe(true)
  })

  it('should create conversation with default title', async () => {
    const created = await repo.create('', 'gpt-4')
    const conv = (await repo.findById(created.id))!
    expect(conv.title).toBe('')
  })

  it('should create conversation with provider_id and api_key_id', async () => {
    const created = await repo.create('Test', 'gpt-4', 1, 2)
    const conv = (await repo.findById(created.id))!
    expect(conv.provider_id).toBe(1)
    expect(conv.api_key_id).toBe(2)
  })

  it('should create conversation with nullable provider_id and api_key_id', async () => {
    const created = await repo.create('Test', 'gpt-4', null, null)
    const conv = (await repo.findById(created.id))!
    expect(conv.provider_id).toBeNull()
    expect(conv.api_key_id).toBeNull()
  })

  it('should get a conversation by id', async () => {
    const created = await repo.create('My Chat', 'claude-3-opus')

    const conv = await repo.findById(created.id)
    expect(conv).not.toBeNull()
    expect(conv!.id).toBe(created.id)
    expect(conv!.title).toBe('My Chat')
    expect(conv!.model).toBe('claude-3-opus')
    expect(conv!.created_at).toBeTruthy()
    expect(conv!.updated_at).toBeTruthy()
  })

  it('should return null for non-existent conversation', async () => {
    const conv = await repo.findById(999)
    expect(conv).toBeNull()
  })

  it('should list all conversations ordered by updated_at desc', async () => {
    const c1 = await repo.create('Chat A', 'gpt-4')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const c2 = await repo.create('Chat B', 'gpt-3.5-turbo')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const c3 = await repo.create('Chat C', 'claude-3-opus')

    const convs = await repo.list()
    expect(convs).toHaveLength(3)

    // Most recently updated should appear first (updated_at defaults to created_at)
    const ids = convs.map((c) => c.id)
    expect(ids).toEqual([c3.id, c2.id, c1.id])
  })

  it('should update conversation title', async () => {
    const created = await repo.create('Original Title', 'gpt-4')
    await repo.update(created.id, { title: 'Updated Title' })

    const conv = (await repo.findById(created.id))!
    expect(conv.title).toBe('Updated Title')
    expect(conv.model).toBe('gpt-4')
  })

  it('should update conversation model', async () => {
    const created = await repo.create('Test', 'gpt-4')
    await repo.update(created.id, { model: 'gpt-4-turbo' })

    const conv = (await repo.findById(created.id))!
    expect(conv.model).toBe('gpt-4-turbo')
  })

  it('should update conversation provider_id', async () => {
    const created = await repo.create('Test', 'gpt-4')
    await repo.update(created.id, { provider_id: 5 })

    const conv = (await repo.findById(created.id))!
    expect(conv.provider_id).toBe(5)
  })

  it('should update conversation api_key_id', async () => {
    const created = await repo.create('Test', 'gpt-4')
    await repo.update(created.id, { api_key_id: 10 })

    const conv = (await repo.findById(created.id))!
    expect(conv.api_key_id).toBe(10)
  })

  it('should set provider_id and api_key_id to null', async () => {
    const created = await repo.create('Test', 'gpt-4', 1, 2)
    await repo.update(created.id, { provider_id: null, api_key_id: null })

    const conv = (await repo.findById(created.id))!
    expect(conv.provider_id).toBeNull()
    expect(conv.api_key_id).toBeNull()
  })

  it('should update updated_at on modification', async () => {
    const created = await repo.create('Test', 'gpt-4')
    const original = (await repo.findById(created.id))!
    const originalUpdatedAt = original.updated_at

    await new Promise((resolve) => setTimeout(resolve, 1100))

    await repo.update(created.id, { title: 'Updated' })
    const updated = (await repo.findById(created.id))!

    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should delete a conversation', async () => {
    const created = await repo.create('To Delete', 'gpt-4')
    expect(await repo.findById(created.id)).not.toBeNull()

    await repo.remove(created.id)
    expect(await repo.findById(created.id)).toBeNull()
  })

  it('should handle delete of non-existent id without error', async () => {
    await expect(repo.remove(999)).resolves.not.toThrow()
  })
})

describe('Conversation Repository Messages', () => {
  let repo: ReturnType<typeof createConversationRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createConversationRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should add a message to a conversation', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    const msgId = await repo.addMessage(conv.id, 'user', 'Hello!')

    expect(msgId).toBeGreaterThan(0)
    expect(Number.isInteger(msgId)).toBe(true)
  })

  it('should add messages with correct fields', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    await repo.addMessage(conv.id, 'user', 'Hello')
    await repo.addMessage(conv.id, 'assistant', 'Hi there!', 'thinking...')

    const messages = await repo.listMessages(conv.id)
    expect(messages).toHaveLength(2)

    const assistantMsg = messages.find((m) => m.role === 'assistant')!
    expect(assistantMsg.content).toBe('Hi there!')
    expect(assistantMsg.thinking).toBe('thinking...')
    expect(assistantMsg.conversation_id).toBe(conv.id)
  })

  it('should default thinking to empty string', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    await repo.addMessage(conv.id, 'user', 'Hello')

    const messages = await repo.listMessages(conv.id)
    expect(messages[0].thinking).toBe('')
  })

  it('should list messages in insertion order (ASC by id)', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    const id1 = await repo.addMessage(conv.id, 'user', 'First')
    const id2 = await repo.addMessage(conv.id, 'assistant', 'Second')
    const id3 = await repo.addMessage(conv.id, 'user', 'Third')

    const messages = await repo.listMessages(conv.id)
    expect(messages).toHaveLength(3)
    expect(messages[0].id).toBe(id1)
    expect(messages[1].id).toBe(id2)
    expect(messages[2].id).toBe(id3)
    expect(messages[0].content).toBe('First')
    expect(messages[1].content).toBe('Second')
    expect(messages[2].content).toBe('Third')
  })

  it('should return empty array for conversation with no messages', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    const messages = await repo.listMessages(conv.id)
    expect(messages).toEqual([])
  })

  it('should update conversation updated_at when adding message', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    const originalUpdatedAt = (await repo.findById(conv.id))!.updated_at

    await new Promise((resolve) => setTimeout(resolve, 1100))

    await repo.addMessage(conv.id, 'user', 'New message')
    const updated = (await repo.findById(conv.id))!
    expect(updated.updated_at).not.toBe(originalUpdatedAt)
  })

  it('should cascade delete messages when conversation is deleted', async () => {
    const conv = await repo.create('Test', 'gpt-4')
    await repo.addMessage(conv.id, 'user', 'Msg 1')
    await repo.addMessage(conv.id, 'user', 'Msg 2')

    expect(await repo.listMessages(conv.id)).toHaveLength(2)

    await repo.remove(conv.id)
    expect(await repo.findById(conv.id)).toBeNull()

    // Verify messages cascade-deleted via Repository method
    expect(await repo.listMessages(conv.id)).toEqual([])
  })

  it('should enforce NOT NULL on messages.conversation_id', () => {
    expect(() => {
      getDb()
        .prepare("INSERT INTO messages (role, content) VALUES ('user', 'test')")
        .run()
    }).toThrow()
  })
})

describe('Conversation Repository thinking/reasoning fields', () => {
  let repo: ReturnType<typeof createConversationRepository>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    createTables()
    repo = createConversationRepository(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('should write thinking_type and reasoning_effort when create passes them', async () => {
    const created = await repo.create('Test', 'gpt-4', null, null, 'enabled', 'high')

    expect(created.thinking_type).toBe('enabled')
    expect(created.reasoning_effort).toBe('high')

    const conv = (await repo.findById(created.id))!
    expect(conv.thinking_type).toBe('enabled')
    expect(conv.reasoning_effort).toBe('high')
  })

  it('should default thinking_type and reasoning_effort to null when create omits them', async () => {
    const created = await repo.create('Test', 'gpt-4')

    expect(created.thinking_type).toBeNull()
    expect(created.reasoning_effort).toBeNull()

    const conv = (await repo.findById(created.id))!
    expect(conv.thinking_type).toBeNull()
    expect(conv.reasoning_effort).toBeNull()
  })

  it('should default thinking_type and reasoning_effort to null when only providerId/apiKeyId passed', async () => {
    // 位置参数：create(title, model, providerId, apiKeyId, thinkingType, reasoningEffort)
    // 传 providerId/apiKeyId 但不传思考参数，两列仍应为 NULL
    const created = await repo.create('Test', 'gpt-4', 1, 2)

    expect(created.thinking_type).toBeNull()
    expect(created.reasoning_effort).toBeNull()
  })

  it('should update thinking_type and reasoning_effort when update passes them', async () => {
    const created = await repo.create('Test', 'gpt-4')
    await repo.update(created.id, { thinking_type: 'adaptive', reasoning_effort: 'max' })

    const conv = (await repo.findById(created.id))!
    expect(conv.thinking_type).toBe('adaptive')
    expect(conv.reasoning_effort).toBe('max')
  })

  it('should not modify thinking_type/reasoning_effort when update omits them (partial update)', async () => {
    const created = await repo.create('Test', 'gpt-4', null, null, 'enabled', 'high')
    await repo.update(created.id, { title: 'New Title' })

    const conv = (await repo.findById(created.id))!
    expect(conv.title).toBe('New Title')
    expect(conv.thinking_type).toBe('enabled')
    expect(conv.reasoning_effort).toBe('high')
  })

  it('should set thinking_type and reasoning_effort to null via update', async () => {
    const created = await repo.create('Test', 'gpt-4', null, null, 'enabled', 'high')
    await repo.update(created.id, { thinking_type: null, reasoning_effort: null })

    const conv = (await repo.findById(created.id))!
    expect(conv.thinking_type).toBeNull()
    expect(conv.reasoning_effort).toBeNull()
  })

  it('should include thinking_type and reasoning_effort in list() results', async () => {
    await repo.create('With Thinking', 'gpt-4', null, null, 'enabled', 'high')
    await repo.create('Without Thinking', 'gpt-4')

    const convs = await repo.list()
    expect(convs).toHaveLength(2)

    const withThinking = convs.find((c) => c.thinking_type === 'enabled')!
    expect(withThinking).toBeDefined()
    expect(withThinking.reasoning_effort).toBe('high')

    const withoutThinking = convs.find((c) => c.title === 'Without Thinking')!
    expect(withoutThinking.thinking_type).toBeNull()
    expect(withoutThinking.reasoning_effort).toBeNull()
  })

  it('should include thinking_type and reasoning_effort in findById() result', async () => {
    const created = await repo.create('Test', 'gpt-4', null, null, 'adaptive', 'medium')
    const conv = (await repo.findById(created.id))!

    expect(conv.thinking_type).toBe('adaptive')
    expect(conv.reasoning_effort).toBe('medium')
  })
})
