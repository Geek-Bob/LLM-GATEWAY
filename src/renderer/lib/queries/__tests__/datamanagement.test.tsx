/**
 * useClearData Hook 测试
 *
 * 验证：
 * - mutation 调用 api.dataManagement.clear(input)
 * - onSuccess 按 input.business 失效 ['providers']/['modelMappings']/['apiKeys']/['conversations']
 * - onSuccess 按 input.operational 失效 ['logs']/['stats']
 * - 组合输入两组失效都触发
 * - 单类输入只触发对应组
 *
 * 策略：mock @/lib/ipc 模块（api.dataManagement.clear），用 QueryClient 包装
 * 测试组件触发 mutate，断言 queryClient.invalidateQueries 的 queryKey 入参。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react' // React 19 act 命名导出
import { useClearData } from '../datamanagement'
import type { ClearDataResult } from '../../../../shared/types'

// ======================
// Mocks
// ======================
// api 在 lib/ipc.ts 中以 `export const api = window.electronAPI` 在模块加载时捕获引用，
// 测试运行时再设 window.electronAPI 已晚。直接 mock @/lib/ipc 模块，
// 使 api 成为由 mock 控制的对象，隔离被测单元。
// vi.mock 工厂会被提升到文件顶部，工厂内引用的变量必须用 vi.hoisted 同步提升。
const _clearMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ipc', () => ({
  api: {
    dataManagement: {
      clear: _clearMock,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const okResult: ClearDataResult = {
  business: { cleared: true },
  operational: { cleared: true },
}

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

/**
 * 渲染一个测试组件，调用 useClearData() 并通过 ref 暴露 mutation 对象。
 * 用 QueryClientProvider 包装。返回 queryClient 以便断言 invalidateQueries。
 */
function renderHarness() {
  const queryClient = createQueryClient()
  const spy = vi.spyOn(queryClient, 'invalidateQueries')

  let mutation: ReturnType<typeof useClearData> | null = null

  function Harness() {
    mutation = useClearData()
    return null
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )

  // mutation 在 render 后被赋值
  return {
    queryClient,
    spy,
    getMutation: () => mutation as unknown as ReturnType<typeof useClearData>,
  }
}

// ======================
// Tests
// ======================

describe('useClearData', () => {
  it('mutate 时调用 api.dataManagement.clear(input)', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { getMutation } = renderHarness()

    const input = { business: true, operational: false }
    await act(async () => {
      await getMutation().mutateAsync(input)
    })

    expect(_clearMock).toHaveBeenCalledTimes(1)
    expect(_clearMock).toHaveBeenCalledWith(input)
  })

  it('business=true 时失效 providers/modelMappings/apiKeys/conversations', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      await getMutation().mutateAsync({ business: true, operational: false })
    })

    const calledKeys = spy.mock.calls.map(c => c[0]?.queryKey)
    expect(calledKeys).toContainEqual(['providers'])
    expect(calledKeys).toContainEqual(['modelMappings'])
    expect(calledKeys).toContainEqual(['apiKeys'])
    expect(calledKeys).toContainEqual(['conversations'])
  })

  it('operational=true 时失效 logs/stats', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      await getMutation().mutateAsync({ business: false, operational: true })
    })

    const calledKeys = spy.mock.calls.map(c => c[0]?.queryKey)
    expect(calledKeys).toContainEqual(['logs'])
    expect(calledKeys).toContainEqual(['stats'])
  })

  it('组合输入两组 invalidate 都触发', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      await getMutation().mutateAsync({ business: true, operational: true })
    })

    const calledKeys = spy.mock.calls.map(c => c[0]?.queryKey)
    // 业务组
    expect(calledKeys).toContainEqual(['providers'])
    expect(calledKeys).toContainEqual(['modelMappings'])
    expect(calledKeys).toContainEqual(['apiKeys'])
    expect(calledKeys).toContainEqual(['conversations'])
    // 运行组
    expect(calledKeys).toContainEqual(['logs'])
    expect(calledKeys).toContainEqual(['stats'])
  })

  it('business=false 时不应失效业务组缓存', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      await getMutation().mutateAsync({ business: false, operational: true })
    })

    const calledKeys = spy.mock.calls.map(c => c[0]?.queryKey)
    expect(calledKeys).not.toContainEqual(['providers'])
    expect(calledKeys).not.toContainEqual(['modelMappings'])
    expect(calledKeys).not.toContainEqual(['apiKeys'])
    expect(calledKeys).not.toContainEqual(['conversations'])
  })

  it('operational=false 时不应失效运行组缓存', async () => {
    _clearMock.mockResolvedValue(okResult)
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      await getMutation().mutateAsync({ business: true, operational: false })
    })

    const calledKeys = spy.mock.calls.map(c => c[0]?.queryKey)
    expect(calledKeys).not.toContainEqual(['logs'])
    expect(calledKeys).not.toContainEqual(['stats'])
  })

  it('不在 query 层 toast（无 onError）— clear reject 不抛到调用方外', async () => {
    _clearMock.mockRejectedValue(new Error('db locked'))
    const { spy, getMutation } = renderHarness()

    await act(async () => {
      try {
        await getMutation().mutateAsync({ business: true, operational: false })
      } catch {
        // mutation reject 会抛出，由调用组件处理
      }
    })

    // 失败时不应触发 invalidateQueries
    expect(spy).not.toHaveBeenCalled()
  })
})
