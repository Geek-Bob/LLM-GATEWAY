import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * 编辑/删除按钮组的 Props 接口
 */
interface ActionButtonsProps {
  /** 编辑回调 */
  onEdit: () => void
  /** 删除回调 */
  onDelete: () => void
  /** 编辑按钮 tooltip 文字，默认 '编辑' */
  editLabel?: string
  /** 删除按钮 tooltip 文字，默认 '删除' */
  deleteLabel?: string
  /** 编辑按钮禁用状态 */
  editDisabled?: boolean
  /** 删除按钮禁用状态 */
  deleteDisabled?: boolean
  /** 附加 className */
  className?: string
}

/**
 * 编辑/删除按钮组，替代每个页面重复手写的 Pencil + Trash2 按钮。
 *
 * @example
 * ```tsx
 * <ActionButtons
 *   onEdit={() => openEdit(item)}
 *   onDelete={() => handleDelete(item)}
 * />
 * ```
 */
export function ActionButtons({
  onEdit,
  onDelete,
  editLabel = '编辑',
  deleteLabel = '删除',
  editDisabled = false,
  deleteDisabled = false,
  className,
}: ActionButtonsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center justify-end gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={editDisabled}
              onClick={onEdit}
              aria-label={editLabel}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{editLabel}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={deleteDisabled}
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
              aria-label={deleteLabel}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{deleteLabel}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
