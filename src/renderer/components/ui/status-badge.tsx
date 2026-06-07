import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  isActive: boolean
  activeText?: string
  inactiveText?: string
  className?: string
}

/**
 * 状态徽章组件 — 显示启用/禁用状态
 * @param isActive 是否启用
 * @param activeText 启用状态文字（默认"启用"）
 * @param inactiveText 禁用状态文字（默认"禁用"）
 */
export function StatusBadge({
  isActive,
  activeText = '启用',
  inactiveText = '禁用',
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        isActive
          ? 'border-green-500/30 text-green-500'
          : 'border-muted-foreground/30 text-muted-foreground',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          isActive ? 'bg-green-500' : 'bg-muted-foreground'
        )}
      />
      {isActive ? activeText : inactiveText}
    </Badge>
  )
}
