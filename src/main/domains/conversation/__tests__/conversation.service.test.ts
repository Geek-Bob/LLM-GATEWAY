/**
 * Conversation Service 测试
 *
 * 测试 Conversation 业务逻辑层，重点验证思考参数（thinkingType/reasoningEffort）的：
 * - create 透传到 repo 并返回含字段的 Response
 * - update 透传到 repo（snake_case 映射）
 * - update 不传两字段时不改动（部分更新语义）
 * - rowToResponse 把 row 的 null 映射为 Response 的 undefined（旧对话向后兼容）
 * - list 路径 rowToResponse 有值映射
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createConversationService } from '../conversation.service'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'

describe('Conversation Service - 思考参数透传', () => {
  let service: ReturnType<typeof createConversationService>

  beforeEach(async () => {
    // 初始化内存数据库并建表（含 conversations.thinking_type/reasoning_effort 两列）
    const db = await initDatabase(':memory:')
    createTables()
    service = createConversationService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('create', () => {
    it('should pass through thinkingType and reasoningEffort to repo and return them in Response', async () => {
      const created = await service.create({
        title: 'Chat',
        model: 'gpt-4',
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      })
      expect(created.thinkingType).toBe('enabled')
      expect(created.reasoningEffort).toBe('high')
    })

    it('should map row null thinking_type/reasoning_effort to undefined in Response when not provided', async () => {
      const created = await service.create({ title: 'Chat', model: 'gpt-4' })
      expect(created.thinkingType).toBeUndefined()
      expect(created.reasoningEffort).toBeUndefined()
    })
  })

  describe('update', () => {
    it('should pass through thinkingType and reasoningEffort to repo (snake_case mapping)', async () => {
      const created = await service.create({ title: 'Chat', model: 'gpt-4' })
      await service.update(created.id, { thinkingType: 'adaptive', reasoningEffort: 'max' })
      const updated = await service.getById(created.id)
      expect(updated?.thinkingType).toBe('adaptive')
      expect(updated?.reasoningEffort).toBe('max')
    })

    it('should not change thinkingType/reasoningEffort when not provided in update', async () => {
      const created = await service.create({
        title: 'Chat',
        model: 'gpt-4',
        thinkingType: 'enabled',
        reasoningEffort: 'medium',
      })
      await service.update(created.id, { title: 'Updated Title' })
      const updated = await service.getById(created.id)
      expect(updated?.title).toBe('Updated Title')
      expect(updated?.thinkingType).toBe('enabled')
      expect(updated?.reasoningEffort).toBe('medium')
    })
  })

  describe('rowToResponse - null/有值映射', () => {
    it('should map thinking_type/reasoning_effort values via list path', async () => {
      await service.create({
        title: 'Chat1',
        model: 'gpt-4',
        thinkingType: 'enabled',
        reasoningEffort: 'low',
      })
      const list = await service.list()
      expect(list[0].thinkingType).toBe('enabled')
      expect(list[0].reasoningEffort).toBe('low')
    })

    it('should map null thinking_type/reasoning_effort to undefined via list path', async () => {
      await service.create({ title: 'Chat1', model: 'gpt-4' })
      const list = await service.list()
      expect(list[0].thinkingType).toBeUndefined()
      expect(list[0].reasoningEffort).toBeUndefined()
    })
  })
})
