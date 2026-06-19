/**
 * TimeTrendAccordion 组件测试（Task 6 改造版）
 *
 * 覆盖验收标准：
 * - 顶部渲染 24h/30d Tab，点击切换数据源
 * - 手风琴按供应商展开，展开后每个模型显示 3 张趋势图
 * - Token 趋势 3 线（总输入/缓存/非缓存）
 * - 花费趋势 3 线（缓存/非缓存/输出）
 * - 次数趋势柱状
 * - Tab 切换保留手风琴展开态
 * - 空数据显示提示
 * - 加载态显示 Skeleton
 * - 非缓存 token = tokensIn - cacheTokens（clamp≥0）
 *
 * mock 策略：
 * - TrendLineChart/TrendBarChart mock 为暴露 props 的占位 div，断言调用参数而非真实 recharts 渲染
 *   （聚焦本组件行为：Tab 切换 + 手风琴 + 3 图调用），recharts 自身已由各自测试覆盖
 * - framer-motion mock 为直接渲染 children，绕过 jsdom 无 layout 的动画问题
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProviderStatsGroup } from '@/lib/types'

// framer-motion mock：jsdom 无 layout，AnimatePresence/motion 动画退化为直接渲染 children
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

// TrendLineChart stub：暴露 xKey/lines/height/data 到 data-* 便于断言调用参数
vi.mock('@/features/dashboard/components/TrendLineChart', () => ({
  TrendLineChart: ({
    data,
    xKey,
    lines,
    height,
  }: {
    data: Array<Record<string, number | string>>
    xKey: string
    lines: Array<{ key: string; name: string; color: string }>
    height?: number
  }) => (
    <div
      data-testid="trend-line-chart"
      data-xkey={xKey}
      data-height={height}
      data-lines={JSON.stringify(lines)}
      data-data={JSON.stringify(data)}
    />
  ),
}))

// TrendBarChart stub：暴露 data/height 到 data-*
vi.mock('@/features/dashboard/components/TrendBarChart', () => ({
  TrendBarChart: ({
    data,
    height,
  }: {
    data: Array<{ period: number | string; requests: number }>
    height?: number
  }) => (
    <div
      data-testid="trend-bar-chart"
      data-height={height}
      data-data={JSON.stringify(data)}
    />
  ),
}))

import { TimeTrendAccordion } from '@/features/dashboard/components/TimeTrendAccordion'

/** 24h 样本：1 供应商 1 模型，2 个小时数据点，数值唯一便于断言。 */
const hourlyStats: ProviderStatsGroup[] = [
  {
    providerId: 1,
    providerName: 'OpenAI',
    models: [
      {
        model: 'gpt-4',
        totalRequests: 15,
        totalTokensIn: 300,
        totalTokensOut: 150,
        totalErrors: 0,
        cacheTokens: 60,
        cost: 0.15,
        dataPoints: [
          {
            period: 0,
            requests: 5,
            tokensIn: 100,
            tokensOut: 50,
            cacheTokens: 20,
            cost: 0.05,
            cacheCost: 0.01,
            uncachedCost: 0.04,
            outputCost: 0.02,
          },
          {
            period: 1,
            requests: 10,
            tokensIn: 200,
            tokensOut: 100,
            cacheTokens: 40,
            cost: 0.1,
            cacheCost: 0.02,
            uncachedCost: 0.08,
            outputCost: 0.04,
          },
        ],
      },
    ],
  },
]

/** 30d 样本：1 供应商 1 模型，1 个日期数据点，数值与 24h 不同便于区分数据源。 */
const dailyStats: ProviderStatsGroup[] = [
  {
    providerId: 1,
    providerName: 'OpenAI',
    models: [
      {
        model: 'gpt-4',
        totalRequests: 50,
        totalTokensIn: 1000,
        totalTokensOut: 500,
        totalErrors: 0,
        cacheTokens: 200,
        cost: 0.5,
        dataPoints: [
          {
            period: '2026-06-18',
            requests: 50,
            tokensIn: 1000,
            tokensOut: 500,
            cacheTokens: 200,
            cost: 0.5,
            cacheCost: 0.1,
            uncachedCost: 0.3,
            outputCost: 0.2,
          },
        ],
      },
    ],
  },
]

describe('TimeTrendAccordion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('加载态显示 Skeleton，不渲染 Tab 与手风琴', () => {
    const { container } = render(
      <TimeTrendAccordion dailyStats={undefined} hourlyStats={undefined} isLoading />,
    )

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '24h' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '30d' })).not.toBeInTheDocument()
  })

  it('顶部渲染 24h 与 30d 两个 Tab，24h 默认激活', () => {
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    const tab24h = screen.getByRole('tab', { name: '24h' })
    const tab30d = screen.getByRole('tab', { name: '30d' })
    expect(tab24h).toBeInTheDocument()
    expect(tab30d).toBeInTheDocument()
    // 24h 默认激活（aria-selected=true）
    expect(tab24h).toHaveAttribute('aria-selected', 'true')
    expect(tab30d).toHaveAttribute('aria-selected', 'false')
  })

  it('默认手风琴折叠，不渲染任何趋势图', () => {
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    expect(screen.queryAllByTestId('trend-line-chart')).toHaveLength(0)
    expect(screen.queryAllByTestId('trend-bar-chart')).toHaveLength(0)
  })

  it('点击供应商行展开，每个模型渲染 3 张图（2 折线 + 1 柱状）', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))

    // 展开后：1 模型 → 2 折线图（Token + 花费）+ 1 柱状图（次数）
    expect(screen.getAllByTestId('trend-line-chart')).toHaveLength(2)
    expect(screen.getAllByTestId('trend-bar-chart')).toHaveLength(1)
  })

  it('展开后 Token 趋势 3 线：总输入/缓存/非缓存，颜色为 chart-4/1/2', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))

    const lineCharts = screen.getAllByTestId('trend-line-chart')
    // 第一张折线图为 Token 趋势
    const tokenLines = JSON.parse(lineCharts[0].getAttribute('data-lines')!) as Array<{
      key: string
      name: string
      color: string
    }>
    expect(tokenLines).toHaveLength(3)
    expect(tokenLines.map((l) => l.name)).toEqual(['总输入', '缓存', '非缓存'])
    expect(tokenLines[0].color).toBe('hsl(var(--chart-4))') // 总输入=灰
    expect(tokenLines[1].color).toBe('hsl(var(--chart-1))') // 缓存=蓝
    expect(tokenLines[2].color).toBe('hsl(var(--chart-2))') // 非缓存=橙
  })

  it('展开后花费趋势 3 线：缓存/非缓存/输出，颜色为 chart-1/2/3', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))

    const lineCharts = screen.getAllByTestId('trend-line-chart')
    // 第二张折线图为花费趋势
    const costLines = JSON.parse(lineCharts[1].getAttribute('data-lines')!) as Array<{
      key: string
      name: string
      color: string
    }>
    expect(costLines).toHaveLength(3)
    expect(costLines.map((l) => l.name)).toEqual(['缓存', '非缓存', '输出'])
    expect(costLines[0].color).toBe('hsl(var(--chart-1))') // 缓存=蓝
    expect(costLines[1].color).toBe('hsl(var(--chart-2))') // 非缓存=橙
    expect(costLines[2].color).toBe('hsl(var(--chart-3))') // 输出=绿
  })

  it('非缓存 token = tokensIn - cacheTokens，clamp≥0', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))

    const tokenChart = screen.getAllByTestId('trend-line-chart')[0]
    const tokenData = JSON.parse(tokenChart.getAttribute('data-data')!) as Array<
      Record<string, number | string>
    >
    // 第二个数据点 tokensIn=200, cacheTokens=40 → 非缓存=160
    expect(tokenData[1].uncachedTokens).toBe(160)
    // 第一个数据点 tokensIn=100, cacheTokens=20 → 非缓存=80
    expect(tokenData[0].uncachedTokens).toBe(80)
  })

  it('24h Tab 下次数柱状图使用 hourlyStats 数据，period 为小时数字', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))

    const barChart = screen.getByTestId('trend-bar-chart')
    const barData = JSON.parse(barChart.getAttribute('data-data')!) as Array<{
      period: number | string
      requests: number
    }>
    expect(barData).toHaveLength(2)
    expect(barData[0].period).toBe(0)
    expect(barData[0].requests).toBe(5)
    expect(barData[1].period).toBe(1)
  })

  it('点击 30d Tab 切换数据源：次数柱状图使用 dailyStats 数据，period 为 MM-DD', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))
    // 切换到 30d
    await user.click(screen.getByRole('tab', { name: '30d' }))

    const barChart = screen.getByTestId('trend-bar-chart')
    const barData = JSON.parse(barChart.getAttribute('data-data')!) as Array<{
      period: number | string
      requests: number
    }>
    expect(barData).toHaveLength(1)
    expect(barData[0].period).toBe('06-18')
    expect(barData[0].requests).toBe(50)
  })

  it('Tab 切换保留手风琴展开态', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    // 24h 下展开供应商
    await user.click(screen.getByText('OpenAI'))
    expect(screen.getAllByTestId('trend-line-chart')).toHaveLength(2)

    // 切到 30d，展开态保留（图表仍在）
    await user.click(screen.getByRole('tab', { name: '30d' }))
    expect(screen.getAllByTestId('trend-line-chart')).toHaveLength(2)
    expect(screen.getByTestId('trend-bar-chart')).toBeInTheDocument()

    // 切回 24h，仍展开
    await user.click(screen.getByRole('tab', { name: '24h' }))
    expect(screen.getAllByTestId('trend-line-chart')).toHaveLength(2)
  })

  it('再次点击已展开的供应商行折叠，趋势图消失', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    await user.click(screen.getByText('OpenAI'))
    expect(screen.getAllByTestId('trend-line-chart')).toHaveLength(2)

    await user.click(screen.getByText('OpenAI'))
    expect(screen.queryAllByTestId('trend-line-chart')).toHaveLength(0)
    expect(screen.queryAllByTestId('trend-bar-chart')).toHaveLength(0)
  })

  it('24h Tab 下激活态数据为空时显示提示', () => {
    render(
      <TimeTrendAccordion
        dailyStats={dailyStats}
        hourlyStats={[]}
        isLoading={false}
      />,
    )

    // 24h 默认激活，hourlyStats 空 → 显示空态
    expect(screen.getByText('暂无统计数据')).toBeInTheDocument()
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument()
  })

  it('30d Tab 下激活态数据为空时显示提示', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion
        dailyStats={[]}
        hourlyStats={hourlyStats}
        isLoading={false}
      />,
    )

    // 切到 30d，dailyStats 空 → 显示空态
    await user.click(screen.getByRole('tab', { name: '30d' }))
    expect(screen.getByText('暂无统计数据')).toBeInTheDocument()
  })

  it('展开供应商行显示模型名、调用次数与 token 汇总', async () => {
    const user = userEvent.setup()
    render(
      <TimeTrendAccordion dailyStats={dailyStats} hourlyStats={hourlyStats} isLoading={false} />,
    )

    // 供应商行摘要
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('1 个模型')).toBeInTheDocument()
    // 24h 激活 → 汇总来自 hourlyStats：15 次调用，300+150 tokens
    expect(screen.getByText('15 次调用')).toBeInTheDocument()
    expect(screen.getByText(/450 tokens/)).toBeInTheDocument()

    // 展开后模型行
    await user.click(screen.getByText('OpenAI'))
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
    const modelRow = screen.getByText('gpt-4').closest('div')
    expect(within(modelRow!).getByText(/15 次/)).toBeInTheDocument()
  })
})
