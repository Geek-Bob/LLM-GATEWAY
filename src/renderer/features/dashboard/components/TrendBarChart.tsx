/**
 * TrendBarChart — 次数趋势柱状图
 *
 * 在仪表板趋势区按模型展示 requests 时序柱状图（24h 或 30d 通用）。
 * 复用 recharts BarChart：
 *   - XAxis=period（小时数或 MM-DD 日期串）
 *   - Bar.dataKey=requests，主题色填充
 *   - 主题色通过 CSS 变量 hsl(var(--primary)) 引用，非硬编码色值
 * 空数据展示 EmptyState 空态，不渲染图表。
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyState } from '@/components/shared/empty-state'

/** TrendBarChart 数据点：period 为小时数或日期字符串，requests 为该时段请求次数。 */
export interface TrendBarChartDatum {
  period: number | string
  requests: number
}

interface TrendBarChartProps {
  data: TrendBarChartDatum[]
  /** 图表高度（像素），默认 100 */
  height?: number
  /** X 轴刻度格式化函数（可选，仅影响刻度显示；tooltip 按 period 原值匹配，不受此影响） */
  xTickFormatter?: (value: string | number) => string
}

/** 次数趋势柱状图：以 requests 为纵轴、period 为横轴渲染 recharts BarChart；空数据显示空态。 @returns 柱状图或空态 JSX。 */
export function TrendBarChart({ data, height = 100, xTickFormatter }: TrendBarChartProps) {
  if (data.length === 0) {
    return <EmptyState title="暂无数据" />
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <XAxis
          dataKey="period"
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tickFormatter={xTickFormatter}
        />
        <YAxis
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
          formatter={(value) => [Number(value ?? 0).toLocaleString(), '请求数']}
        />
        <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} maxBarSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}
