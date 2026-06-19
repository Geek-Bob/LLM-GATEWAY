// @vitest-environment node
/**
 * conversations IPC handler 单元测试
 *
 * 验证 by-id handler（update / delete / getById / listMessages）以及
 * createMessage 对入参的 Zod 校验：
 * - id 必须是正整数（int positive）
 * - 非法 id（NaN、0、-1、字符串）经 wrapIpcHandler 捕获后应返回
 *   { error: 'Invalid input: id: ...' }，而不是直接抛到 Electron 层
 * - createMessage 在收到非法 payload（缺少 conversationId 等）时也应返回 Invalid input
 *
 * Task 4 补充：思考参数（thinkingType/reasoningEffort）IPC 契约验证
 * - create handler 单参数对象形态：合法枚举透传 service 返回值，非法枚举映射 Invalid input
 * - update handler 两参数形态（id + data 对象）：合法 id + 合法枚举透传持久化，
 *   合法 id + 非法枚举由 schema.parse 抛 ZodError 被 wrapIpcHandler 统一映射
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Mock electron.ipcMain，以便在测试中捕获 handler 注册
const handlerRegistry = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlerRegistry.set(channel, handler)
    },
  },
}))

import { initDatabase, closeDatabase, getDb } from '../../db/connection'
import { createTables } from '../../db/schema'
import { registerConversationHandlers } from '../conversations'

const ID_INVALID_CASES: Array<{ label: string; value: unknown }> = [
  { label: 'NaN', value: Number.NaN },
  { label: '0', value: 0 },
  { label: '-1', value: -1 },
  { label: "字符串 '1'", value: '1' },
]

const BY_ID_CHANNELS = [
  'conversation:update',
  'conversation:delete',
  'conversation:getById',
  'conversation:listMessages',
] as const

describe('conversations IPC handlers', () => {
  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  beforeEach(() => {
    handlerRegistry.clear()
    registerConversationHandlers(getDb())
  })

  describe.each(BY_ID_CHANNELS)('%s — id 校验', (channel) => {
    it.each(ID_INVALID_CASES)('id 为 $label 时应返回 Invalid input 错误', async ({ value }) => {
      const handler = handlerRegistry.get(channel)
      expect(handler).toBeDefined()
      // update 形式接收 (event, id, data)，其余接收 (event, id)
      const result = channel === 'conversation:update'
        ? await handler!({}, value, { title: 't' })
        : await handler!({}, value)
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('id')
    })
  })

  describe('conversation:createMessage — payload 校验', () => {
    it('payload 缺失 conversationId 时应返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('conversation:createMessage')
      expect(handler).toBeDefined()
      const result = await handler!({}, { role: 'user', content: 'hi' })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })

    it('payload 为非对象（字符串）时应返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('conversation:createMessage')
      const result = await handler!({}, 'not-an-object')
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })
  })

  describe('conversation:create — 思考参数透传与枚举校验', () => {
    it('合法 thinkingType/reasoningEffort 经 schema 校验后透传 service 返回值', async () => {
      const handler = handlerRegistry.get('conversation:create')
      expect(handler).toBeDefined()
      const result = await handler!({}, {
        title: 'Chat',
        model: 'gpt-4',
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      })
      // service 返回 ConversationResponse，handler 原样透传（含思考字段）
      expect(result).toMatchObject({
        title: 'Chat',
        model: 'gpt-4',
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      })
      expect(result).not.toHaveProperty('error')
    })

    it('非法 thinkingType 经 schema.parse 抛 ZodError，wrapIpcHandler 映射为 Invalid input', async () => {
      const handler = handlerRegistry.get('conversation:create')
      const result = await handler!({}, {
        title: 'Chat',
        model: 'gpt-4',
        thinkingType: 'foo',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('thinkingType')
    })

    it('非法 reasoningEffort 经 schema.parse 抛 ZodError，wrapIpcHandler 映射为 Invalid input', async () => {
      const handler = handlerRegistry.get('conversation:create')
      const result = await handler!({}, {
        title: 'Chat',
        model: 'gpt-4',
        reasoningEffort: 'foo',
      })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('reasoningEffort')
    })
  })

  describe('conversation:update — 两参数形态与思考参数透传', () => {
    it('合法 id + 合法思考参数对象透传 service（update 返回 void，经 getById 验证持久化）', async () => {
      // 先经 create handler 拿到合法 id（同时验证 create 链路）
      const createHandler = handlerRegistry.get('conversation:create')
      const created = await createHandler!({}, { title: 'Chat', model: 'gpt-4' }) as { id: number }
      const validId = created.id

      const handler = handlerRegistry.get('conversation:update')
      // 两参数形态：(event, id, data 对象)
      const result = await handler!({}, validId, { thinkingType: 'adaptive', reasoningEffort: 'max' })
      // service.update 返回 void，handler 原样透传 undefined
      expect(result).toBeUndefined()

      // 通过 getById handler 验证字段已落库
      const getByIdHandler = handlerRegistry.get('conversation:getById')
      const after = await getByIdHandler!({}, validId) as {
        thinkingType?: string
        reasoningEffort?: string
      }
      expect(after.thinkingType).toBe('adaptive')
      expect(after.reasoningEffort).toBe('max')
    })

    it('合法 id + 非法 thinkingType 对象：id 先通过 idSchema，data 被 schema 拒绝', async () => {
      const createHandler = handlerRegistry.get('conversation:create')
      const created = await createHandler!({}, { title: 'Chat', model: 'gpt-4' }) as { id: number }
      const validId = created.id

      const handler = handlerRegistry.get('conversation:update')
      const result = await handler!({}, validId, { thinkingType: 'foo' })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      // 错误指向 thinkingType 字段，说明 idSchema 已通过（否则错误会是 id 相关的 number 校验）
      expect((result as { error: string }).error).toContain('thinkingType')
    })

    it('合法 id + 非法 reasoningEffort 对象：id 先通过 idSchema，data 被 schema 拒绝', async () => {
      const createHandler = handlerRegistry.get('conversation:create')
      const created = await createHandler!({}, { title: 'Chat', model: 'gpt-4' }) as { id: number }
      const validId = created.id

      const handler = handlerRegistry.get('conversation:update')
      const result = await handler!({}, validId, { reasoningEffort: 'foo' })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('reasoningEffort')
    })
  })
})
