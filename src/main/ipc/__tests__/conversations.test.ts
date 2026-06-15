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
})
