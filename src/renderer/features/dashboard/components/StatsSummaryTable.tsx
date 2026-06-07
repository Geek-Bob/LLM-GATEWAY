/**
 * StatsSummaryTable — 调用统计汇总表格
 *
 * 按供应商/模型维度展示 30 天调用统计
 * 供应商行显示汇总数据，下属模型行缩进展示明细
 * 加载中显示 Skeleton，无数据时显示 EmptyState
 *
 * @param dailyStats - 30 天日维度统计分组数据
 * @param isLoading - 是否正在加载
 */

import type { ProviderStatsGroup } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface StatsSummaryTableProps {
  dailyStats: ProviderStatsGroup[] | undefined
  isLoading: boolean
}

/** 调用统计汇总表格，按供应商/模型维度展示 30 天调用统计。 @returns 统计表格 JSX。 */
export function StatsSummaryTable({ dailyStats, isLoading }: StatsSummaryTableProps) {
  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!dailyStats || dailyStats.length === 0) {
    return <EmptyState title="暂无统计数据" description="发送请求后自动生成" />
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-foreground">调用统计</h2>
      </div>
      <Card className="border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>供应商 / 模型</TableHead>
              <TableHead className="text-right">调用次数</TableHead>
              <TableHead className="text-right">输入 Tokens</TableHead>
              <TableHead className="text-right">输出 Tokens</TableHead>
              <TableHead className="text-right">错误</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dailyStats.map((group) => [
              <TableRow key={group.providerId}>
                <TableCell className="font-medium text-foreground">{group.providerName}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {group.models.reduce((s, m) => s + m.totalTokensIn, 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {group.models.reduce((s, m) => s + m.totalTokensOut, 0).toLocaleString()}
                </TableCell>
                <TableCell className={`text-right ${group.models.reduce((s, m) => s + m.totalErrors, 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {group.models.reduce((s, m) => s + m.totalErrors, 0)}
                </TableCell>
              </TableRow>,
              ...group.models.map((model) => (
                <TableRow key={`${group.providerId}-${model.model}`}>
                  <TableCell className="pl-8 text-muted-foreground">└ {model.model}</TableCell>
                  <TableCell className="text-right text-foreground">{model.totalRequests.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{model.totalTokensIn.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{model.totalTokensOut.toLocaleString()}</TableCell>
                  <TableCell className={`text-right ${model.totalErrors > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{model.totalErrors}</TableCell>
                </TableRow>
              ))
            ])}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
