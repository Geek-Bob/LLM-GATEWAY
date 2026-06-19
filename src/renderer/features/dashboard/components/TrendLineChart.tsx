/**
 * TrendLineChart — Recharts 多系列折线图通用组件
 *
 * 用途：仪表板趋势区按供应商/模型分组的 Token / 花费 多系列折线图。
 *
 * 设计文档：docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#3-前端布局与组件
 *
 * 颜色策略：由调用方通过 lines[].color 传入 hsl(var(--chart-x)) 主题变量，
 * 组件本身不硬编码色值（符合 frontend/37-visual-style.md 主题变量规则）。
 * recharts 的 tick/contentStyle 沿用项目既有图表风格（recharts 不接受 className）。
 */
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyState } from '@/components/shared/empty-state'

/** 单条折线定义 */
export interface TrendLine {
  /** 数据字段名（data 中对应键） */
  key: string
  /** 图例显示名 */
  name: string
  /** 线条颜色（建议用 hsl(var(--chart-x)) 主题变量） */
  color: string
}

/** TrendLineChart 组件 props */
export interface TrendLineChartProps {
  /** 数据点数组，每个元素是 Record<字段名, 数值或字符串> */
  data: Array<Record<string, number | string>>
  /** X 轴字段名（如 'period'） */
  xKey: string
  /** 折线定义数组，每项渲染一条 Line */
  lines: TrendLine[]
  /** 图表高度（px），默认 100 */
  height?: number
  /** Y 轴数值格式化函数（可选，同时应用于 YAxis 刻度与 Tooltip） */
  yFormatter?: (value: number) => string
}

/** 默认图表高度（px） */
const DEFAULT_HEIGHT = 100

/** recharts XAxis/YAxis 刻度样式 */
const axisTickStyle = { fontSize: 9, fill: 'hsl(var(--muted-foreground))' }

/** recharts Tooltip 容器样式（recharts 不接受 className） */
const tooltipContentStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
}

/** Legend 容器样式（小字号适配仪表板紧凑布局） */
const legendWrapperStyle = { fontSize: 11 }

/**
 * 多系列折线图组件。
 * @param data - 数据点数组
 * @param xKey - X 轴字段名
 * @param lines - 折线定义数组
 * @param height - 图表高度（px），默认 100
 * @param yFormatter - Y 轴数值格式化函数（可选）
 * @returns 折线图 JSX；data 为空时返回 EmptyState 提示
 * @example
 * <TrendLineChart
 *   data={[{ period: '06-17', cache: 10, uncached: 20 }]}
 *   xKey="period"
 *   lines={[
 *     { key: 'cache', name: '缓存', color: 'hsl(var(--chart-1))' },
 *     { key: 'uncached', name: '非缓存', color: 'hsl(var(--chart-2))' },
 *   ]}
 *   height={120}
 *   yFormatter={(v) => v.toLocaleString()}
 * />
 */
export function TrendLineChart({ data, xKey, lines, height = DEFAULT_HEIGHT, yFormatter }: TrendLineChartProps) {
  // 空数据：显示提示而非空轴（设计文档第 5 节边界处理）
  if (data.length === 0) {
    return <EmptyState title="暂无趋势数据" />
  }

  // yFormatter 包装：recharts 传入的 value 可能是 number | string | 数组，统一 Number() 转 number 再格式化。
  // formatter 内联让 TS 从 recharts prop 类型推断 value（ValueType | undefined），避免显式类型不兼容。
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <XAxis dataKey={xKey} tick={axisTickStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={24} tickFormatter={yFormatter ? (v: number) => yFormatter(Number(v)) : undefined} />
        <Tooltip contentStyle={tooltipContentStyle} formatter={yFormatter ? (value) => yFormatter(Number(value)) : undefined} />
        <Legend wrapperStyle={legendWrapperStyle} />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={1.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
