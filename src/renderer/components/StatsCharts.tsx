import { BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, ResponsiveContainer } from 'recharts'
import type { StatsDataPoint } from '../lib/types'

interface HourlyBarChartProps {
  data: StatsDataPoint[]
  height?: number
}

export function HourlyBarChart({ data, height = 100 }: HourlyBarChartProps) {
  // Fill missing hours with 0
  const filled = Array.from({ length: 24 }, (_, i) => {
    const existing = data.find((d) => d.period === i)
    return { hour: `${i}:00`, requests: existing?.requests ?? 0, tokensIn: existing?.tokensIn ?? 0, tokensOut: existing?.tokensOut ?? 0 }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={filled} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e' }} interval={3} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip
          contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, fontSize: 12 }}
          formatter={(value) => [Number(value ?? 0).toLocaleString(), '请求数']}
        />
        <Bar dataKey="requests" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface DailyAreaChartProps {
  data: StatsDataPoint[]
  height?: number
}

export function DailyAreaChart({ data, height = 100 }: DailyAreaChartProps) {
  const filled = data.map((d) => ({
    date: typeof d.period === 'string' ? d.period.slice(5) : String(d.period),
    requests: d.requests,
    tokensIn: d.tokensIn,
    tokensOut: d.tokensOut,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={filled} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8b949e' }} interval={4} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip
          contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, fontSize: 12 }}
          formatter={(value) => [Number(value ?? 0).toLocaleString(), '请求数']}
        />
        <Area type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={1.5} fill="url(#areaFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
