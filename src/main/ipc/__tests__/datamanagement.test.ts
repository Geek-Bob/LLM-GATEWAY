// @vitest-environment node
/**
 * Task 5: datamanagement IPC handler 单元测试
 *
 * 验证 `datamanagement:clear` 通道的接口层契约：
 * 1. handler 经 wrapIpcHandler 包装，注册到 'datamanagement:clear' 通道
 * 2. data 参数 unknown，入口走 clearDataSchema.parse(data)
 * 3. 合法输入 → 委派 service.clear(input) 并原样返回 ClearDataResult
 * 4. 非法输入（business=false operational=false / 非 boolean / 缺字段）
 *    → wrapIpcHandler 捕获 ZodError，返回 { error: 'Invalid input: ...' }
 * 5. service 抛业务错误（Failed to ...）→ wrapIpcHandler 原样透传错误消息
 *
 * Mock 边界（遵循 backend/37-testing.md）：
 * - Mock createDataManagementService：service 层逻辑已在
 *   domains/datamanagement/__tests__/datamanagement.service.test.ts 覆盖，
 *   IPC 测试聚焦「校验 + 委派 + 返回」契约，不重复 service 行为。
 *   同时避免 service.clear 触发 resetLogs 的文件系统副作用。
 * - Mock electron.ipcMain：捕获 handler 注册，避免真实 Electron IPC 依赖。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron.ipcMain，以便在测试中捕获 handler 注册
const handlerRegistry = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlerRegistry.set(channel, handler)
    },
  },
}))

// Mock createDataManagementService：仅验证 handler 委派行为
// service.clear 默认返回空结果，每个用例按需覆盖
// vi.mock 路径相对于测试文件解析（__tests__/ → ../../domains/...）
const clearMock = vi.fn()
vi.mock('../../domains/datamanagement/datamanagement.service', () => ({
  createDataManagementService: () => ({
    clear: clearMock,
  }),
}))

import { registerDataManagementHandlers } from '../datamanagement'
import type { ClearDataResult } from '../../../shared/types'

const SUCCESS_RESULT: ClearDataResult = {
  business: { cleared: true },
  operational: { cleared: false }
}

describe('datamanagement IPC handlers', () => {
  beforeEach(() => {
    handlerRegistry.clear()
    clearMock.mockReset()
    // 默认返回成功结果，覆盖「合法输入委派 service」路径
    clearMock.mockResolvedValue(SUCCESS_RESULT)
    // registerDataManagementHandlers 需要 db 参数，但 service 已 mock，
    // 传入空对象满足类型即可（db 不直接被 handler 使用）
    registerDataManagementHandlers({} as never)
  })

  describe('datamanagement:clear — 通道注册', () => {
    it('应注册到 datamanagement:clear 通道', () => {
      expect(handlerRegistry.has('datamanagement:clear')).toBe(true)
    })
  })

  describe('datamanagement:clear — 合法输入', () => {
    it('business=true operational=false 时委派 service.clear 并返回 ClearDataResult', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, { business: true, operational: false })

      // 委派 service.clear：参数应为校验后的对象
      expect(clearMock).toHaveBeenCalledTimes(1)
      expect(clearMock).toHaveBeenCalledWith({ business: true, operational: false })

      // 返回值与 service 返回类型一致（不做额外转换）
      expect(result).toEqual(SUCCESS_RESULT)
    })

    it('business=true operational=true 时委派 service.clear', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      await handler({}, { business: true, operational: true })

      expect(clearMock).toHaveBeenCalledWith({ business: true, operational: true })
    })

    it('business=false operational=true 时委派 service.clear', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      await handler({}, { business: false, operational: true })

      expect(clearMock).toHaveBeenCalledWith({ business: false, operational: true })
    })
  })

  describe('datamanagement:clear — 非法输入（Zod 校验）', () => {
    it('business=false operational=false 时返回 Invalid input 错误（至少一个为 true）', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, { business: false, operational: false })

      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      // 错误消息应提示「至少一个」业务规则
      const err = (result as { error: string }).error
      expect(err).toMatch(/至少一个/)
      // service 不应被调用（校验在委派前）
      expect(clearMock).not.toHaveBeenCalled()
    })

    it('business 为非 boolean（字符串 yes）时返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, { business: 'yes', operational: true })

      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      const err = (result as { error: string }).error
      expect(err).toContain('business')
      expect(clearMock).not.toHaveBeenCalled()
    })

    it('空对象（缺字段）时返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, {})

      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect(clearMock).not.toHaveBeenCalled()
    })

    it('data 为非对象（字符串）时返回 Invalid input 错误', async () => {
      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, 'not-an-object')

      expect(result).toMatchObject({ error: expect.stringContaining('Invalid input') })
      expect(clearMock).not.toHaveBeenCalled()
    })
  })

  describe('datamanagement:clear — 错误透传', () => {
    it('service 抛业务错误（Failed to 开头）时原样透传给渲染进程', async () => {
      clearMock.mockReset()
      clearMock.mockRejectedValue(new Error('Failed to clear business data: transaction aborted'))

      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, { business: true, operational: false })

      expect(result).toEqual({ error: 'Failed to clear business data: transaction aborted' })
    })

    it('service 抛部分成功错误时消息含 business data already cleared 提示', async () => {
      clearMock.mockReset()
      clearMock.mockRejectedValue(
        new Error('Failed to clear operational data: disk full (business data already cleared)')
      )

      const handler = handlerRegistry.get('datamanagement:clear')!
      const result = await handler({}, { business: true, operational: true })

      const err = (result as { error: string }).error
      expect(err).toContain('business data already cleared')
    })
  })
})
