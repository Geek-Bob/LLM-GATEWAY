/**
 * RangeSummaryCard — 24h/30d 时间窗口汇总卡
 *
 * 展示指定时间窗口的 token 三分（缓存/非缓存/输出，加总）+ 费用三分 + 次数。
 * 内部调用 useRangeSummary(range) 获取数据。
 *
 * 三种状态：
 * - 加载中（isLoading）→ Skeleton 占位
 * - 空数据（data 缺失或 totalRequests=0）→ EmptyState 提示
 * - 有数据 → token 4 列 + 费用 4 列 + 次数
 *
 * props:
 * - range: 时间窗口，'24h' → "近 24 小时"，'30d' → "近 30 天"
 */
import { useRangeSummary } from '@/lib/queries/stats'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'

interface RangeSummaryCardProps {
  range: '24h' | '30d'
}

/** 时间窗口 → 中文标题映射。 */
const RANGE_TITLE: Record<'24h' | '30d', string> = {
  '24h': '近 24 小时',
  '30d': '近 30 天',
}

/** Token / 费用共用列定义：总 / 缓存 / 非缓存 / 输出。 */
const SUMMARY_COLUMNS = [
  { key: 'total', label: '总' },
  { key: 'cache', label: '缓存' },
  { key: 'uncached', label: '非缓存' },
  { key: 'output', label: '输出' },
] as const

type SummaryColumnKey = (typeof SUMMARY_COLUMNS)[number]['key']

/** 格式化费用为美元字符串（2-4 位小数，统一元单位）。 @param cost 费用数值（美元） @returns 形如 "$1.2345" 的字符串 */
function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost)
}

/** 格式化 token / 次数为带千分位的字符串。 @param value 数值 @returns 形如 "1,100" 的字符串 */
function formatNumber(value: number): string {
  return value.toLocaleString()
}

/** 24h/30d 时间窗口汇总卡，展示 token 三分 + 费用三分 + 次数。 @returns 汇总卡 JSX。 */
export function RangeSummaryCard({ range }: RangeSummaryCardProps) {
  const { data, isLoading } = useRangeSummary(range)

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  // 空数据：data 缺失（未加载到）或该窗口无请求记录
  if (!data || data.totalRequests === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <EmptyState title="暂无统计数据" description="发送请求后自动生成" />
        </CardContent>
      </Card>
    )
  }

  const tokenValues: Record<SummaryColumnKey, number> = {
    total: data.totalTokens,
    cache: data.cacheTokens,
    uncached: data.uncachedTokens,
    output: data.outputTokens,
  }
  const costValues: Record<SummaryColumnKey, number> = {
    total: data.totalCost,
    cache: data.cacheCost,
    uncached: data.uncachedCost,
    output: data.outputCost,
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">
          {RANGE_TITLE[range]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <section aria-label="Token 统计" className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Token</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SUMMARY_COLUMNS.map((col) => (
              <div key={col.key} className="space-y-1">
                <p className="text-xs text-muted-foreground">{col.label}</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {formatNumber(tokenValues[col.key])}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section aria-label="费用统计" className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">费用</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SUMMARY_COLUMNS.map((col) => (
              <div key={col.key} className="space-y-1">
                <p className="text-xs text-muted-foreground">{col.label}</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {formatCost(costValues[col.key])}
                </p>
              </div>
            ))}
          </div>
        </section>
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">次数</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatNumber(data.totalRequests)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
