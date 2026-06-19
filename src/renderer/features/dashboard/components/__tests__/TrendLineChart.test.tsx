/**
 * TrendLineChart 组件测试
 *
 * 覆盖验收标准：
 * - 渲染传入的每条 line（按 lines 数组）
 * - XAxis 用 xKey、YAxis 用数值
 * - 空数据显示空态/提示
 * - yFormatter 应用到 tooltip/axis
 *
 * jsdom 无 layout 尺寸，recharts ResponsiveContainer 无法真实测量，
 * 故 vi.mock recharts 为轻量 stub，断言 props 传递而非真实渲染（frontend/36-frontend-testing.md）。
 * stub 把每个组件渲染为带 data-testid 的 div，非函数 props 序列化到 data-* 便于断言。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TrendLineChart } from '@/features/dashboard/components/TrendLineChart'

// recharts stub：jsdom 无尺寸，真实 ResponsiveContainer 渲染 0 高度会抛错。
// 用轻量 div stub 暴露 props，测组件 props 传递与空态逻辑。
// stub 把 recharts 组件 prop 序列化到 data-* 属性，便于 querySelector 断言。
vi.mock('recharts', () => {
  // stub 渲染 children 以保留组件树嵌套（ResponsiveContainer→LineChart→Line/XAxis...），
  // 同时把非 children 的 prop 序列化到 data-* 便于断言。
  const stub = (testId: string) => (props: Record<string, unknown>) => {
    const { children, ...rest } = props
    const dataset: Record<string, string> = {}
    for (const [k, v] of Object.entries(rest)) {
      // 跳过未传的 prop（hasAttribute 才能正确返回 false）
      if (v === undefined) continue
      dataset[`data-${k.toLowerCase()}`] = typeof v === 'function' ? '[fn]' : String(v)
    }
    return <div data-testid={`recharts-${testId}`} {...dataset}>{children as ReactNode}</div>
  }
  return {
    ResponsiveContainer: stub('ResponsiveContainer'),
    LineChart: stub('LineChart'),
    Line: stub('Line'),
    XAxis: stub('XAxis'),
    YAxis: stub('YAxis'),
    Tooltip: stub('Tooltip'),
    Legend: stub('Legend'),
  }
})

/** 样本数据：3 个数据点，2 条线 a/b，数值唯一便于断言。 */
const sampleData: Array<Record<string, number | string>> = [
  { period: '2026-06-17', a: 10, b: 20 },
  { period: '2026-06-18', a: 15, b: 25 },
  { period: '2026-06-19', a: 12, b: 30 },
]

/** 样本折线：2 条，颜色用主题变量占位。 */
const lines = [
  { key: 'a', name: '缓存', color: 'hsl(var(--chart-1))' },
  { key: 'b', name: '非缓存', color: 'hsl(var(--chart-2))' },
]

describe('TrendLineChart', () => {
  it('按 lines 数组渲染每条折线，携带正确的 dataKey/name/color', () => {
    const { container } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} />,
    )

    const lineNodes = container.querySelectorAll('[data-testid="recharts-Line"]')
    expect(lineNodes).toHaveLength(2)
    expect(lineNodes[0].getAttribute('data-datakey')).toBe('a')
    expect(lineNodes[0].getAttribute('data-name')).toBe('缓存')
    expect(lineNodes[0].getAttribute('data-stroke')).toBe('hsl(var(--chart-1))')
    expect(lineNodes[1].getAttribute('data-datakey')).toBe('b')
    expect(lineNodes[1].getAttribute('data-name')).toBe('非缓存')
    expect(lineNodes[1].getAttribute('data-stroke')).toBe('hsl(var(--chart-2))')
  })

  it('XAxis 使用 xKey 作为 dataKey', () => {
    const { container } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} />,
    )

    const xAxis = container.querySelector('[data-testid="recharts-XAxis"]')
    expect(xAxis?.getAttribute('data-datakey')).toBe('period')
  })

  it('空数据显示"暂无趋势数据"提示，不渲染 LineChart 与 Line', () => {
    const { container } = render(
      <TrendLineChart data={[]} xKey="period" lines={lines} />,
    )

    expect(screen.getByText('暂无趋势数据')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="recharts-LineChart"]')).toBeNull()
    expect(container.querySelector('[data-testid="recharts-Line"]')).toBeNull()
  })

  it('yFormatter 同时应用到 YAxis.tickFormatter 和 Tooltip.formatter', () => {
    const yFormatter = (v: number) => `${v}k`
    const { container } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} yFormatter={yFormatter} />,
    )

    const yAxis = container.querySelector('[data-testid="recharts-YAxis"]')
    expect(yAxis?.getAttribute('data-tickformatter')).toBe('[fn]')

    const tooltip = container.querySelector('[data-testid="recharts-Tooltip"]')
    expect(tooltip?.getAttribute('data-formatter')).toBe('[fn]')
  })

  it('未传 yFormatter 时 YAxis 与 Tooltip 均不带 formatter', () => {
    const { container } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} />,
    )

    const yAxis = container.querySelector('[data-testid="recharts-YAxis"]')
    expect(yAxis?.hasAttribute('data-tickformatter')).toBe(false)

    const tooltip = container.querySelector('[data-testid="recharts-Tooltip"]')
    expect(tooltip?.hasAttribute('data-formatter')).toBe(false)
  })

  it('默认 height=100 传给 ResponsiveContainer，可通过 props 覆盖', () => {
    const { container, rerender } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} />,
    )
    const rc1 = container.querySelector('[data-testid="recharts-ResponsiveContainer"]')
    expect(rc1?.getAttribute('data-height')).toBe('100')

    rerender(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} height={200} />,
    )
    const rc2 = container.querySelector('[data-testid="recharts-ResponsiveContainer"]')
    expect(rc2?.getAttribute('data-height')).toBe('200')
  })

  it('渲染 Legend 组件', () => {
    const { container } = render(
      <TrendLineChart data={sampleData} xKey="period" lines={lines} />,
    )

    expect(container.querySelector('[data-testid="recharts-Legend"]')).not.toBeNull()
  })
})
