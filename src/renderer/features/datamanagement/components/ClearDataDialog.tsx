import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** 用户必须输入以解锁确认按钮的校验字符串 */
const CONFIRM_TEXT = '清空'

/** ClearDataDialog 组件属性 */
export interface ClearDataDialogProps {
  /** 弹窗是否打开（受控，由父组件管理） */
  open: boolean
  /** 弹窗打开状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 即将清空的模块勾选状态，决定展示列表 */
  selectedModules: { business: boolean; operational: boolean }
  /** 确认清空回调（由父组件触发实际清空） */
  onConfirm: () => void
  /** 清空中状态（loading），为 true 时禁用按钮并显示加载态 */
  isPending?: boolean
}

/** 根据 selectedModules 拼接"即将清空：xxx、xxx"列表文本 */
function buildModuleList(selectedModules: ClearDataDialogProps['selectedModules']): string {
  const modules: string[] = []
  if (selectedModules.business) modules.push('业务数据')
  if (selectedModules.operational) modules.push('运行数据')
  return `即将清空：${modules.join('、')}`
}

/**
 * 清空数据的强确认弹窗。
 *
 * 受控组件，展示即将清空的模块列表 + 不可恢复警告，要求用户输入"清空"二字
 * 才启用确认按钮（防误操作的最强确认机制，因业务数据含不可恢复的 API Key/对话）。
 * 纯 UI 组件，不直接调 IPC，onConfirm 回调由父组件触发 useClearData。
 *
 * @param props - 组件属性
 * @returns AlertDialog JSX
 * @example
 * <ClearDataDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   selectedModules={{ business: true, operational: true }}
 *   onConfirm={handleConfirm}
 *   isPending={isPending}
 * />
 */
export function ClearDataDialog({
  open,
  onOpenChange,
  selectedModules,
  onConfirm,
  isPending = false,
}: ClearDataDialogProps) {
  const [confirmInput, setConfirmInput] = useState('')

  // 弹窗关闭时重置输入（下一次打开为空，避免残留"清空"导致按钮直接可用）。
  // 用 useEffect 监听 open 而非仅 onOpenChange：父组件受控改 open prop（不经 onOpenChange）也需重置。
  useEffect(() => {
    if (!open) setConfirmInput('')
  }, [open])

  // 仅当输入等于"清空"且非 pending 时启用确认按钮
  const canConfirm = confirmInput === CONFIRM_TEXT && !isPending

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    // AlertDialogAction 默认会关闭弹窗；阻止默认关闭，由父组件根据清空结果控制
    event.preventDefault()
    if (!canConfirm) return
    onConfirm()
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认清空数据</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{buildModuleList(selectedModules)}</p>
              <p className="text-destructive font-medium">此操作不可恢复！</p>
              <p>
                请输入&ldquo;{CONFIRM_TEXT}&rdquo;以确认：
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          placeholder={CONFIRM_TEXT}
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          autoComplete="off"
          aria-label="清空确认输入框"
        />

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn('bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90')}
          >
            {isPending ? '清空中...' : '确认清空'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
