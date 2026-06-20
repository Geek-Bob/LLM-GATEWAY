/**
 * useConversationManager 携带思考设置测试（Task 10）
 *
 * 覆盖验收标准：
 * - selectConversation 返回对话的 thinkingType/reasoningEffort（旧对话无值时返回默认 disabled/medium）
 * - saveUserMessage 新建对话时携带当前思考设置
 * - saveUserMessage 已有对话且思考设置变化时调 update 更新
 * - saveUserMessage 已有对话且思考设置未变时不调 update
 * - 已有对话非思考字段变化时仍触发 update（不破坏既有变更检测）
 *
 * 策略：mock @/lib/ipc 模块（api 在 lib/ipc.ts 模块加载时即捕获 window.electronAPI 引用，
 * 运行时再设 window.electronAPI 已晚，须直接 mock 模块），用 QueryClientProvider 包装 renderHook。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import { useConversationManager, DEFAULT_THINKING_CONFIG } from '../useConversationManager'
import type { ThinkingConfig } from '../useChatStream'

// ======================
// Mocks
// ======================
// vi.mock 工厂会被提升到文件顶部，工厂内引用的变量必须用 vi.hoisted 同步提升。
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  messages: vi.fn(),
  addMessage: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  api: {
    conversations: {
      list: mocks.list,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.del,
      get: mocks.get,
      messages: mocks.messages,
      addMessage: mocks.addMessage,
    },
  },
}))

// ======================
// Helpers
// ======================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface RenderParams {
  activeConversationId?: number | null
  getThinkingConfig?: () => ThinkingConfig
}

/**
 * 用 QueryClientProvider 包装 renderHook，返回 hook 结果。
 * 默认 getThinkingConfig 返回 disabled/medium（与 UI 默认一致）。
 */
function renderManager(params: RenderParams = {}) {
  const queryClient = createQueryClient()
  const setActiveConversationId = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return renderHook(
    () =>
      useConversationManager({
        activeConversationId: params.activeConversationId ?? null,
        setActiveConversationId,
        getThinkingConfig: params.getThinkingConfig ?? (() => ({ thinkingType: 'disabled', reasoningEffort: 'medium' })),
      }),
    { wrapper },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue([])
  mocks.create.mockResolvedValue({
    id: 1, title: '', providerId: null, model: '', apiKeyId: null,
    createdAt: '', updatedAt: '',
  })
  mocks.update.mockResolvedValue(undefined)
  mocks.del.mockResolvedValue(undefined)
  mocks.get.mockResolvedValue(null)
  mocks.messages.mockResolvedValue([])
  mocks.addMessage.mockResolvedValue({
    id: 1, conversationId: 0, role: 'user', content: '', thinking: '', createdAt: '',
  })
})

// ======================
// Tests
// ======================

describe('useConversationManager - 思考设置携带', () => {
  describe('selectConversation 返回思考设置', () => {
    it('对话含 thinkingType/reasoningEffort 时原样返回', async () => {
      mocks.get.mockResolvedValue({
        id: 1, title: 't', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'enabled', reasoningEffort: 'high',
        createdAt: '', updatedAt: '',
      })
      mocks.messages.mockResolvedValue([])

      const { result } = renderManager()

      let selected: Awaited<ReturnType<typeof result.current.selectConversation>> | undefined
      await act(async () => {
        selected = await result.current.selectConversation(1)
      })

      expect(selected?.thinkingType).toBe('enabled')
      expect(selected?.reasoningEffort).toBe('high')
      // 既有字段不受影响
      expect(selected?.providerId).toBe(1)
      expect(selected?.model).toBe('gpt-4')
      expect(selected?.apiKeyId).toBe(1)
    })

    it('旧对话无思考字段时返回默认 disabled/medium', async () => {
      mocks.get.mockResolvedValue({
        id: 2, title: 'old', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        // 无 thinkingType / reasoningEffort（旧对话 NULL）
        createdAt: '', updatedAt: '',
      })
      mocks.messages.mockResolvedValue([])

      const { result } = renderManager()

      let selected: Awaited<ReturnType<typeof result.current.selectConversation>> | undefined
      await act(async () => {
        selected = await result.current.selectConversation(2)
      })

      expect(selected?.thinkingType).toBe('disabled')
      expect(selected?.reasoningEffort).toBe('medium')
    })
  })

  describe('saveUserMessage 新建对话携带思考设置', () => {
    it('无活跃会话时 create 携带当前 getThinkingConfig 返回的思考设置', async () => {
      mocks.create.mockResolvedValue({
        id: 10, title: 'hi', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'enabled', reasoningEffort: 'high',
        createdAt: '', updatedAt: '',
      })

      const { result } = renderManager({
        activeConversationId: null,
        getThinkingConfig: () => ({ thinkingType: 'enabled', reasoningEffort: 'high' }),
      })

      await act(async () => {
        await result.current.saveUserMessage('hi', 1, 'gpt-4', 1)
      })

      expect(mocks.create).toHaveBeenCalledTimes(1)
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-4',
        providerId: 1,
        apiKeyId: 1,
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      }))
    })
  })

  describe('saveUserMessage 已有对话的思考设置更新', () => {
    it('思考设置变化时调 update 更新思考字段', async () => {
      mocks.get.mockResolvedValue({
        id: 5, title: 't', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'disabled', reasoningEffort: 'medium', // 与当前不同
        createdAt: '', updatedAt: '',
      })

      const { result } = renderManager({
        activeConversationId: 5,
        getThinkingConfig: () => ({ thinkingType: 'enabled', reasoningEffort: 'high' }),
      })

      await act(async () => {
        await result.current.saveUserMessage('hi', 1, 'gpt-4', 1)
      })

      expect(mocks.update).toHaveBeenCalledTimes(1)
      expect(mocks.update).toHaveBeenCalledWith(5, expect.objectContaining({
        thinkingType: 'enabled',
        reasoningEffort: 'high',
        model: 'gpt-4',
        providerId: 1,
        apiKeyId: 1,
      }))
    })

    it('思考设置与其它字段均未变时不调 update', async () => {
      mocks.get.mockResolvedValue({
        id: 5, title: 't', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'enabled', reasoningEffort: 'high', // 与当前一致
        createdAt: '', updatedAt: '',
      })

      const { result } = renderManager({
        activeConversationId: 5,
        getThinkingConfig: () => ({ thinkingType: 'enabled', reasoningEffort: 'high' }),
      })

      await act(async () => {
        await result.current.saveUserMessage('hi', 1, 'gpt-4', 1)
      })

      expect(mocks.update).not.toHaveBeenCalled()
    })

    it('思考设置未变但 providerId 变化时仍调 update（不破坏既有变更检测）', async () => {
      mocks.get.mockResolvedValue({
        id: 5, title: 't', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'enabled', reasoningEffort: 'high', // 思考未变
        createdAt: '', updatedAt: '',
      })

      const { result } = renderManager({
        activeConversationId: 5,
        getThinkingConfig: () => ({ thinkingType: 'enabled', reasoningEffort: 'high' }),
      })

      // providerId 1 → 2 变化
      await act(async () => {
        await result.current.saveUserMessage('hi', 2, 'gpt-4', 1)
      })

      expect(mocks.update).toHaveBeenCalledTimes(1)
      expect(mocks.update).toHaveBeenCalledWith(5, expect.objectContaining({
        providerId: 2,
        thinkingType: 'enabled',
        reasoningEffort: 'high',
      }))
    })
  })

  describe('getThinkingConfig 未提供时回退 DEFAULT_THINKING_CONFIG', () => {
    it('不传 getThinkingConfig 时 saveUserMessage 新建对话携带默认 disabled/medium', async () => {
      // 直接 inline renderHook，绕过 renderManager 的默认 getThinkingConfig，
      // 验证 hook 内部 getThinkingConfig?.() ?? DEFAULT_THINKING_CONFIG 回退逻辑。
      mocks.create.mockResolvedValue({
        id: 7, title: 'fallback', providerId: 1, model: 'gpt-4', apiKeyId: 1,
        thinkingType: 'disabled', reasoningEffort: 'medium',
        createdAt: '', updatedAt: '',
      })
      const queryClient = createQueryClient()
      const setActiveConversationId = vi.fn()
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children)
      const { result } = renderHook(
        () => useConversationManager({
          activeConversationId: null,
          setActiveConversationId,
          // 故意不传 getThinkingConfig，验证回退
        }),
        { wrapper },
      )

      await act(async () => {
        await result.current.saveUserMessage('hi', 1, 'gpt-4', 1)
      })

      expect(mocks.create).toHaveBeenCalledTimes(1)
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        thinkingType: DEFAULT_THINKING_CONFIG.thinkingType,
        reasoningEffort: DEFAULT_THINKING_CONFIG.reasoningEffort,
      }))
      expect(DEFAULT_THINKING_CONFIG.thinkingType).toBe('disabled')
      expect(DEFAULT_THINKING_CONFIG.reasoningEffort).toBe('medium')
    })
  })
})
