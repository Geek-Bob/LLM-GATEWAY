// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../conversation.schema'

describe('createConversationSchema', () => {
  it('should accept valid input', () => {
    const result = createConversationSchema.parse({ title: 'Chat', model: 'gpt-4' })
    expect(result.title).toBe('Chat')
  })

  it('should reject empty title', () => {
    expect(() => createConversationSchema.parse({ title: '', model: 'gpt-4' })).toThrow()
  })

  it('should reject empty model', () => {
    expect(() => createConversationSchema.parse({ title: 'Chat', model: '' })).toThrow()
  })

  it('should accept null providerId and apiKeyId', () => {
    const result = createConversationSchema.parse({ title: 'Chat', model: 'gpt-4', providerId: null, apiKeyId: null })
    expect(result.providerId).toBeNull()
  })

  it('should accept missing providerId and apiKeyId (optional)', () => {
    const result = createConversationSchema.parse({ title: 'Chat', model: 'gpt-4' })
    expect(result.providerId).toBeUndefined()
  })
})

describe('updateConversationSchema', () => {
  it('should accept partial update', () => {
    const result = updateConversationSchema.parse({ title: 'Updated' })
    expect(result.title).toBe('Updated')
  })

  it('should accept empty object', () => {
    const result = updateConversationSchema.parse({})
    expect(result).toEqual({})
  })
})

describe('addMessageSchema', () => {
  it('should accept valid message', () => {
    const result = addMessageSchema.parse({ conversationId: 1, role: 'user', content: 'Hello' })
    expect(result.role).toBe('user')
  })

  it('should reject invalid role', () => {
    expect(() => addMessageSchema.parse({ conversationId: 1, role: 'system', content: 'Hello' })).toThrow()
  })

  it('should accept optional thinking field', () => {
    const result = addMessageSchema.parse({ conversationId: 1, role: 'assistant', content: 'Hi', thinking: 'Let me think...' })
    expect(result.thinking).toBe('Let me think...')
  })
})
