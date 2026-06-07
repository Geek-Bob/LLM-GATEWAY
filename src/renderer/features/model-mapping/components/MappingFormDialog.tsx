/**
 * MappingFormDialog — 模型映射创建/编辑弹窗
 *
 * 包含请求模型（手动输入）和映射模型（下拉选择）两个字段。
 * 请求模型与映射模型不能相同，否则提交按钮禁用。
 * UNIQUE 约束冲突时显示友好提示。
 *
 * @param open - 弹窗是否打开
 * @param onOpenChange - 弹窗开关状态变更回调
 * @param editingId - 编辑模式下的映射 ID，null 表示新建
 * @param initialForm - 编辑模式下的初始表单数据
 * @param models - 可选模型列表（用于下拉选择）
 * @param onSaved - 保存成功后的回调
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useCreateModelMapping, useUpdateModelMapping } from '@/lib/queries/modelMappings'
import { getErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ModelInfo } from '../../../../shared/types'

/** 表单数据结构 */
export interface MappingForm {
  sourceModel: string
  targetModel: string
}

/** 表单初始值 */
const emptyForm: MappingForm = {
  sourceModel: '',
  targetModel: '',
}

interface MappingFormDialogProps {
  /** 弹窗是否打开 */
  open: boolean
  /** 弹窗开关状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 编辑模式下的映射 ID，null 表示新建 */
  editingId: number | null
  /** 编辑模式下的初始表单数据 */
  initialForm?: MappingForm
  /** 可选模型列表（用于下拉选择） */
  models: ModelInfo[]
  /** 保存成功后的回调 */
  onSaved: () => void
}

/** 模型映射创建/编辑弹窗，包含请求模型和映射模型两个字段。 @returns 模型映射表单弹窗 JSX。 */
export function MappingFormDialog({
  open,
  onOpenChange,
  editingId,
  initialForm,
  models,
  onSaved,
}: MappingFormDialogProps) {
  const createMutation = useCreateModelMapping()
  const updateMutation = useUpdateModelMapping()

  const [form, setForm] = useState<MappingForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialForm ?? emptyForm)
    }
  }, [open, initialForm])

  /** 提交表单 */
  const handleSave = async () => {
    if (!form.sourceModel || !form.targetModel) return

    if (form.sourceModel === form.targetModel) {
      toast.error('请求模型和映射模型不能相同')
      return
    }

    setSaving(true)
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({
          id: editingId,
          sourceModel: form.sourceModel,
          targetModel: form.targetModel,
        })
        toast.success('映射已更新')
      } else {
        await createMutation.mutateAsync({
          sourceModel: form.sourceModel,
          targetModel: form.targetModel,
        })
        toast.success('映射已创建')
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      const raw = getErrorMessage(e)
      if (raw.includes('UNIQUE')) {
        toast.error('该请求模型已存在映射规则')
      } else {
        toast.error(`保存失败: ${raw}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingId !== null ? '编辑映射' : '新增映射'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-1.5 text-muted-foreground">请求模型</Label>
            <Input
              value={form.sourceModel}
              onChange={(e) => setForm((prev) => ({ ...prev, sourceModel: e.target.value }))}
              placeholder="输入客户端请求的模型名，如 gpt-4o"
            />
          </div>

          <div>
            <Label className="mb-1.5 text-muted-foreground">映射模型</Label>
            <Select
              value={form.targetModel}
              onValueChange={(value) => setForm((prev) => ({ ...prev, targetModel: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={models.length === 0 ? '无可用模型' : '选择映射模型'} />
              </SelectTrigger>
              <SelectContent>
                {models.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    请先配置供应商
                  </SelectItem>
                ) : (
                  models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.sourceModel || !form.targetModel || form.sourceModel === form.targetModel}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
