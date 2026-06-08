import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  className?: string
}

/**
 * 空状态占位组件 — 数据为空时展示
 * @param icon 图标（可选，emoji 或 lucide 图标）
 * @param title 标题文字
 * @param description 描述文字（可选）
 */
export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={`rounded-xl border border-border bg-card p-12 text-center ${className ?? ''}`}>
      {icon && <div className="text-3xl mb-3 opacity-40">{icon}</div>}
      <p className="text-base font-medium mb-1 text-muted-foreground">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground/60">{description}</p>
      )}
    </div>
  )
}
