import { Skeleton } from '@/components/ui/skeleton'

interface TableSkeletonProps {
  rows?: number
  className?: string
}

/**
 * 表格骨架屏组件 — 加载状态时展示
 * @param rows 骨架行数（默认 3）
 */
export function TableSkeleton({ rows = 3, className }: TableSkeletonProps) {
  return (
    <div className={`rounded-xl border border-border bg-card p-8 ${className ?? ''}`}>
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
