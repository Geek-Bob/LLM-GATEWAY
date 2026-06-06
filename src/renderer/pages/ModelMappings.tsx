/**
 * ModelMappings 页面 — 模型名称映射 CRUD 管理
 *
 * 数据流:
 * 1. useModelMappings 通过 IPC 获取所有映射列表
 * 2. useModels 获取所有活跃 provider 的模型列表（用于下拉选择）
 * 3. useCreateModelMapping / useUpdateModelMapping / useDeleteModelMapping 处理增删改
 * 4. 弹出 Dialog 中选择请求模型 + 映射模型
 *
 * 模型 ID 格式: "providerName/modelName"（来自 models.list()）
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { pageVariants, childVariants, rowFadeIn } from '@/lib/animations'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { ModelMapping } from '../../shared/types'
import { getErrorMessage } from '@/lib/utils'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

/** 表单数据结构 */
interface MappingForm {
  sourceModel: string
  targetModel: string
}

/** 表单初始值 */
const emptyForm: MappingForm = {
  sourceModel: '',
  targetModel: '',
}

export function ModelMappingsPage() {
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<MappingForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // 查询映射列表
  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['model-mappings'],
    queryFn: () => api.models.mapping.list(),
  })

  // 查询模型列表（用于下拉选择，来源为所有活跃 provider 的模型）
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.models.list(),
  })

  // 创建映射
  const createMutation = useMutation({
    mutationFn: (data: { sourceModel: string; targetModel: string }) =>
      api.models.mapping.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
    },
  })

  // 更新映射
  const updateMutation = useMutation({
    mutationFn: ({ id, ...updates }: { id: number } & Partial<MappingForm>) =>
      api.models.mapping.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
    },
  })

  // 删除映射
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.models.mapping.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
    },
  })

  /** 打开新建弹窗 */
  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  /** 打开编辑弹窗 */
  const openEdit = (m: ModelMapping) => {
    setEditingId(m.id)
    setForm({
      sourceModel: m.sourceModel,
      targetModel: m.targetModel,
    })
    setModalOpen(true)
  }

  /** 提交表单 */
  const handleSave = async () => {
    if (!form.sourceModel || !form.targetModel) return

    // 前置校验：请求模型与映射模型不能相同
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
      setModalOpen(false)
    } catch (e) {
      const raw = getErrorMessage(e)
      // 处理 UNIQUE 约束冲突
      if (raw.includes('UNIQUE')) {
        toast.error('该请求模型已存在映射规则')
      } else {
        toast.error(`保存失败: ${raw}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const { execute: deleteMapping } = useDeleteWithToast(deleteMutation, '映射')

  /** 删除映射 */
  const handleDelete = (m: ModelMapping) => deleteMapping(m.id, `${m.sourceModel} → ${m.targetModel}`)

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={childVariants}>
        <PageHeader
          title="模型映射"
          description="配置模型名称转换规则，将请求中的模型名映射到实际模型"
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" />
              新增映射
            </Button>
          }
        />
      </motion.div>

      {/* Content */}
      <motion.div variants={childVariants}>
      {isLoading ? (
        <TableSkeleton />
      ) : mappings.length === 0 ? (
        <EmptyState icon="&#128260;" title="暂无映射" description="点击上方「新增映射」开始配置模型名称转换规则" />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>请求模型</TableHead>
                <TableHead>映射模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m, idx) => (
                <motion.tr key={m.id} {...rowFadeIn(idx)} className="border-b transition-colors hover:bg-muted/50">
                  <TableCell>
                    <code className="text-sm font-mono text-foreground">{m.sourceModel}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm font-mono text-foreground">{m.targetModel}</code>
                  </TableCell>
                  <TableCell>
                    <StatusBadge active={m.isActive === 1} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" className="text-primary" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </motion.div>

      {/* Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? '编辑映射' : '新增映射'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">请求模型</label>
              <Input
                value={form.sourceModel}
                onChange={(e) => setForm((prev) => ({ ...prev, sourceModel: e.target.value }))}
                placeholder="输入客户端请求的模型名，如 gpt-4o"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">映射模型</label>
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
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
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
    </motion.div>
  )
}
