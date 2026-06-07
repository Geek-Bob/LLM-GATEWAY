import type * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

/**
 * 统一表单对话框的 Props 接口
 */
interface FormDialogProps {
  /** 对话框打开状态 */
  open: boolean
  /** 对话框打开状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 对话框标题 */
  title: string
  /** 对话框描述（可选） */
  description?: string
  /** 表单提交回调 */
  onSubmit: (e: React.FormEvent) => void
  /** 提交按钮文字，默认 '保存' */
  submitLabel?: string
  /** 取消按钮文字，默认 '取消' */
  cancelLabel?: string
  /** 提交按钮禁用状态 */
  isSubmitDisabled?: boolean
  /** 提交按钮加载中文字（如 '保存中...'），传入时 isSubmitDisabled 应为 true */
  submitLoadingLabel?: string
  /** 表单内容 */
  children: React.ReactNode
  /** 附加 className */
  className?: string
}

/**
 * 统一的表单对话框布局，替代每个页面重复手写的 Dialog 表单结构。
 * 表单使用 `<form onSubmit>` 包裹全部内容（含 footer），提交按钮为 `type="submit"`。
 *
 * @example
 * ```tsx
 * <FormDialog
 *   open={modalOpen}
 *   onOpenChange={setModalOpen}
 *   title="编辑供应商"
 *   onSubmit={handleSubmit}
 * >
 *   <Input value={name} onChange={e => setName(e.target.value)} />
 * </FormDialog>
 * ```
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = '保存',
  cancelLabel = '取消',
  isSubmitDisabled = false,
  submitLoadingLabel,
  children,
  className,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-lg', className)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {children}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isSubmitDisabled && submitLoadingLabel ? submitLoadingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
