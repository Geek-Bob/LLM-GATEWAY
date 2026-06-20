/**
 * RangeSummaryCard 组件测试
 *
 * 覆盖验收标准：
 * - range="24h" 渲染"近 24 小时"标题，range="30d" 渲染"近 30 天"标题
 * - 渲染 token 4 列数值（总/缓存/非缓存/输出）
 * - 渲染费用 4 列数值（总/缓存/非缓存/输出）
 * - 渲染次数
 * - 加载态显示 Skeleton
 * - 空数据（totalRequests=0）显示提示
 *
 * mock useRangeSummary 以控制 data/isLoading 状态（frontend/36-frontend-testing.md）。
 * 用 within(region) 隔离 Token 区与费用区的同名列查询。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RangeSummaryCard } from '@/features/dashboard/components/RangeSummaryCard'
import * as statsQueries from '@/lib/queries/stats'
import type { RangeSummary } from '@/lib/types'

vi.mock('@/lib/queries/stats', () => ({
  useRangeSummary: vi.fn(),
}))

/** 包裹 QueryClientProvider，让 useRangeSummary 内部的 useQuery 可用。 */
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** 样本数据：各字段数值唯一，便于 getByText 精确断言。 */
const sampleData: RangeSummary = {
  totalTokens: 1100,
  inputTokens: 600,
  cacheTokens: 200,
  uncachedTokens: 400,
  outputTokens: 500,
  totalCost: 1.2345,
  cacheCost: 0.1,
  uncachedCost: 0.5,
  outputCost: 0.6345,
  totalRequests: 42,
}

describe('RangeSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('range="24h" 时渲染"近 24 小时"标题并调用 useRangeSummary("24h")', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: sampleData,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    expect(screen.getByText('近 24 小时')).toBeInTheDocument()
    expect(statsQueries.useRangeSummary).toHaveBeenCalledWith('24h')
  })

  it('range="30d" 时渲染"近 30 天"标题并调用 useRangeSummary("30d")', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: sampleData,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="30d" />)

    expect(screen.getByText('近 30 天')).toBeInTheDocument()
    expect(statsQueries.useRangeSummary).toHaveBeenCalledWith('30d')
  })

  it('渲染 token 4 列数值（总/缓存/非缓存/输出）', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: sampleData,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    const tokenRegion = screen.getByRole('region', { name: 'Token 统计' })
    expect(within(tokenRegion).getByText('总')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('缓存')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('非缓存')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('输出')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('1,100')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('200')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('400')).toBeInTheDocument()
    expect(within(tokenRegion).getByText('500')).toBeInTheDocument()
  })

  it('渲染费用 4 列数值（总/缓存/非缓存/输出）', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: sampleData,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    const costRegion = screen.getByRole('region', { name: '费用统计' })
    expect(within(costRegion).getByText('总')).toBeInTheDocument()
    expect(within(costRegion).getByText('缓存')).toBeInTheDocument()
    expect(within(costRegion).getByText('非缓存')).toBeInTheDocument()
    expect(within(costRegion).getByText('输出')).toBeInTheDocument()
    expect(within(costRegion).getByText('$1.2345')).toBeInTheDocument()
    expect(within(costRegion).getByText('$0.10')).toBeInTheDocument()
    expect(within(costRegion).getByText('$0.50')).toBeInTheDocument()
    expect(within(costRegion).getByText('$0.6345')).toBeInTheDocument()
  })

  it('渲染次数', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: sampleData,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    expect(screen.getByText('次数')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('加载态显示 Skeleton，不渲染标题与数值', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    const { container } = renderWithQuery(<RangeSummaryCard range="24h" />)

    // Skeleton 渲染为带 animate-pulse 的占位块
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    // 加载态不渲染标题与数值
    expect(screen.queryByText('近 24 小时')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Token 统计' })).not.toBeInTheDocument()
  })

  it('空数据（totalRequests=0）显示提示，不渲染数值区', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: { ...sampleData, totalRequests: 0, totalTokens: 0, totalCost: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    expect(screen.getByText('暂无统计数据')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Token 统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '费用统计' })).not.toBeInTheDocument()
  })

  it('data=undefined 且非加载态显示提示', () => {
    vi.mocked(statsQueries.useRangeSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof statsQueries.useRangeSummary>)

    renderWithQuery(<RangeSummaryCard range="24h" />)

    expect(screen.getByText('暂无统计数据')).toBeInTheDocument()
  })
})
