/**
 * TrendBarChart 组件测试
 *
 * 覆盖验收标准：
 * - 渲染 requests 柱状，XAxis=period
 * - 空数据显示空态
 * - 复用 recharts（BarChart/Bar/XAxis/YAxis/Tooltip）
 *
 * mock 策略：recharts 在 jsdom 无 ResizeObserver/尺寸环境，全量 mock，
 * 各组件渲染带 data-testid 的占位 div，并把关键 props 透传到 data-* 属性，
 * 以断言 TrendBarChart 以正确的 data/dataKey/axisKey 调用 recharts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/** 透传关键 props 到 data-* 属性的占位 div 工厂，便于断言 recharts 组件调用参数。 */
function stub(testid: string) {
  return ({ children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <div data-testid={testid} {...Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [`data-${k.toLowerCase()}`, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
    )}>
      {children}
    </div>
  )
}

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height, width }: any) => (
    <div data-testid="responsive-container" data-height={height} data-width={width}>{children}</div>
  ),
  BarChart: ({ data, children }: any) => (
    <div data-testid="bar-chart" data-data={JSON.stringify(data)}>{children}</div>
  ),
  Bar: stub('bar'),
  XAxis: stub('xaxis'),
  YAxis: stub('yaxis'),
  Tooltip: stub('tooltip'),
}))

import { TrendBarChart } from '@/features/dashboard/components/TrendBarChart'

describe('TrendBarChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有数据时渲染 recharts BarChart 并以 requests 为 Bar.dataKey、period 为 XAxis.dataKey', () => {
    const data = [
      { period: 0, requests: 5 },
      { period: 1, requests: 10 },
      { period: 2, requests: 3 },
    ]

    render(<TrendBarChart data={data} />)

    // BarChart 被渲染，且传入的 data 是原样透传
    const barChart = screen.getByTestId('bar-chart')
    expect(barChart).toBeInTheDocument()
    expect(JSON.parse(barChart.getAttribute('data-data')!)).toEqual(data)

    // Bar 用 requests 作为 dataKey
    const bar = screen.getByTestId('bar')
    expect(bar.getAttribute('data-datakey')).toBe('requests')

    // XAxis 用 period 作为 dataKey
    const xaxis = screen.getByTestId('xaxis')
    expect(xaxis.getAttribute('data-datakey')).toBe('period')

    // YAxis 与 Tooltip 同时存在
    expect(screen.getByTestId('yaxis')).toBeInTheDocument()
    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
  })

  it('空数据显示空态，不渲染 BarChart', () => {
    render(<TrendBarChart data={[]} />)

    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bar')).not.toBeInTheDocument()
  })

  it('未传 height 时使用默认高度 100', () => {
    render(<TrendBarChart data={[{ period: 0, requests: 1 }]} />)

    const container = screen.getByTestId('responsive-container')
    expect(container.getAttribute('data-height')).toBe('100')
  })

  it('传入 height 时使用自定义高度', () => {
    render(<TrendBarChart data={[{ period: 0, requests: 1 }]} height={150} />)

    const container = screen.getByTestId('responsive-container')
    expect(container.getAttribute('data-height')).toBe('150')
  })
})
