import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * 页面头部组件 — 统一页面标题和操作按钮的布局
 * @param title 页面标题
 * @param description 页面描述（可选）
 * @param action 操作按钮（可选）
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-6 ${className ?? ''}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm mt-1 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
