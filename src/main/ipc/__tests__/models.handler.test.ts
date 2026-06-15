// @vitest-environment node
/**
 * models IPC handler 单元测试
 *
 * 验证 models:mapping:update 对 payload.id 的 Zod 校验：
 * - id 必须是正整数（int positive）
 * - 非法 id（NaN、负数、字符串）经 wrapIpcHandler 捕获后应返回
 *   { error: 'Invalid input: id: ...' }，而不是直接抛到 Electron 层
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
import { registerModelHandlers } from '../models'

describe('models IPC handlers', () => {
  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  beforeEach(() => {
    handlerRegistry.clear()
    registerModelHandlers(getDb())
  })

  describe('models:mapping:update — id 校验', () => {
    it('id 为 NaN 时应返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('models:mapping:update')
      expect(handler).toBeDefined()
      const result = await handler!(/* event */ {}, { id: Number.NaN, updates: {} })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('id')
    })

    it('id 为负数时应返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('models:mapping:update')
      const result = await handler!({}, { id: -1, updates: { sourceModel: 'a' } })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('id')
    })

    it("id 为字符串 'abc' 时应返回 Invalid input 错误", async () => {
      const handler = handlerRegistry.get('models:mapping:update')
      const result = await handler!({}, { id: 'abc', updates: {} })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('id')
    })

    it('id 为 0 时应返回 Invalid input 错误（非正整数）', async () => {
      const handler = handlerRegistry.get('models:mapping:update')
      const result = await handler!({}, { id: 0, updates: {} })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect((result as { error: string }).error).toContain('id')
    })

    it('payload 缺失 id 时应返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('models:mapping:update')
      const result = await handler!({}, { updates: {} })
      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
    })
  })
})
