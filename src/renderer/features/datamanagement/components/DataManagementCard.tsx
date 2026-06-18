/**
 * 数据管理 Card 组件 — Settings 页清空数据入口
 *
 * 职责：
 * - 自包含状态机：business / operational 两个 Checkbox 勾选态 + 弹窗开关态
 * - 点击"清空选中数据"打开 ClearDataDialog 强确认弹窗（传入当前勾选）
 * - 确认后调用 useClearData mutation 执行清空：
 *   - 成功 → toast.success + 关弹窗 + 重置 Checkbox
 *   - 失败 → toast.error(getErrorMessage(e))，弹窗保持打开允许重试
 *
 * 组合 Task 7（useClearData）与 Task 8（ClearDataDialog）形成完整交互闭环。
 * 本组件不直接调 IPC，不持有清空逻辑（委派 useClearData）。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/utils'
import { useClearData } from '@/lib/queries/datamanagement'
import { ClearDataDialog } from '@/features/datamanagement/components/ClearDataDialog'

/** 业务数据 Checkbox 的 label 关联 id */
const BUSINESS_CHECKBOX_ID = 'clear-business-data'
/** 运行数据 Checkbox 的 label 关联 id */
const OPERATIONAL_CHECKBOX_ID = 'clear-operational-data'

/**
 * 数据管理 Card：按模块清空本地数据的入口组件。
 *
 * @returns 数据管理 Card JSX（含强确认弹窗）
 * @example
 * <DataManagementCard />
 */
export function DataManagementCard() {
  // 两个 Checkbox 受控勾选态 + 弹窗开关态
  const [business, setBusiness] = useState(false)
  const [operational, setOperational] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const clearData = useClearData()

  // 两个 Checkbox 均未勾选时禁用触发按钮（防无意义清空）
  const canClear = business || operational

  /** 点击"清空选中数据"按钮打开强确认弹窗。 */
  const handleClearClick = () => {
    setDialogOpen(true)
  }

  /**
   * 弹窗确认回调：调用 useClearData 触发清空。
   * 成功 → toast.success + 关弹窗 + 重置 Checkbox；失败 → toast.error 并保持弹窗打开（允许重试）。
   */
  const handleConfirm = async (): Promise<void> => {
    try {
      await clearData.mutateAsync({ business, operational })
      toast.success('已清空选中数据')
      setDialogOpen(false)
      // 清空成功后重置勾选，避免残留态让用户误以为还要再清一次
      setBusiness(false)
      setOperational(false)
    } catch (e) {
      // 清空未成功，保持弹窗打开与勾选态，便于用户重试
      toast.error(getErrorMessage(e))
    }
  }

  /**
   * 弹窗开关拦截：清空中（isPending）拒绝关闭。
   * 数据清空不可恢复，关闭弹窗会让用户失去进度感知与重试入口；
   * 非清空中按 Esc / 点遮罩 / 点取消仍允许正常关闭。
   */
  const handleDialogOpenChange = (open: boolean): void => {
    if (!open && clearData.isPending) return
    setDialogOpen(open)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>数据管理</CardTitle>
          <CardDescription>
            按模块清空本地数据，操作不可恢复，请谨慎选择
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id={BUSINESS_CHECKBOX_ID}
              checked={business}
              onCheckedChange={(checked) => setBusiness(checked === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor={BUSINESS_CHECKBOX_ID}>业务数据</Label>
              <p className="text-sm text-muted-foreground">
                供应商配置 · 模型映射 · API 密钥 · 对话历史 (Agent 配置将保留)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id={OPERATIONAL_CHECKBOX_ID}
              checked={operational}
              onCheckedChange={(checked) => setOperational(checked === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor={OPERATIONAL_CHECKBOX_ID}>运行数据</Label>
              <p className="text-sm text-muted-foreground">请求日志 · 统计数据</p>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={handleClearClick}
            disabled={!canClear}
          >
            清空选中数据
          </Button>
        </CardContent>
      </Card>

      <ClearDataDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        selectedModules={{ business, operational }}
        onConfirm={handleConfirm}
        isPending={clearData.isPending}
      />
    </>
  )
}
