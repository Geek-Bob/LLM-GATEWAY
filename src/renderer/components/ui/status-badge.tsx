import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  active: boolean
  activeText?: string
  inactiveText?: string
  className?: string
}

/**
 * 状态徽章组件 — 显示启用/禁用状态
 * @param active 是否启用
 * @param activeText 启用状态文字（默认"启用"）
 * @param inactiveText 禁用状态文字（默认"禁用"）
 */
export function StatusBadge({
  active,
  activeText = '启用',
  inactiveText = '禁用',
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        active
          ? 'border-green-500/30 text-green-500'
          : 'border-muted-foreground/30 text-muted-foreground',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          active ? 'bg-green-500' : 'bg-muted-foreground'
        )}
      />
      {active ? activeText : inactiveText}
    </Badge>
  )
}
