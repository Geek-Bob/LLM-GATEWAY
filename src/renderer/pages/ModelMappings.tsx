/**
 * ModelMappings 页面 — 模型名称映射 CRUD 管理
 *
 * 数据流:
 * 1. useModelMappings 通过 IPC 获取所有映射列表
 * 2. useModels 获取所有活跃 provider 的模型列表（用于下拉选择）
 * 3. useCreateModelMapping / useUpdateModelMapping / useDeleteModelMapping 处理增删改
 * 4. 弹出 Dialog 中选择 Provider Type + 源模型 + 目标模型
 *
 * 模型 ID 格式: "providerName/modelName"（来自 models.list()）
 * 映射存储格式: 仅 modelName（DB 的 source_model / target_model 列）
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import type { ModelMapping } from '../../main/domains/models/models.types'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'

/** 表单数据结构 */
interface MappingForm {
  providerType: string
  sourceModel: string
  targetModel: string
}

/** 表单初始值 */
const emptyForm: MappingForm = {
  providerType: 'openai',
  sourceModel: '',
  targetModel: '',
}

/**
 * 从复合模型 ID 中提取模型名称
 * "providerName/modelName" → "modelName"
 */
function extractModelName(compositeId: string): string {
  const slashIdx = compositeId.indexOf('/')
  return slashIdx >= 0 ? compositeId.slice(slashIdx + 1) : compositeId
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
    mutationFn: (data: { providerType: string; sourceModel: string; targetModel: string }) =>
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

  // 按 providerType 过滤模型列表
  const filteredModels = models.filter((m) => m.providerType === form.providerType)

  /** 打开新建弹窗 */
  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  /** 打开编辑弹窗：将 DB 中的纯模型名映射回复合 ID 供下拉选择 */
  const openEdit = (m: ModelMapping) => {
    setEditingId(m.id)
    // 从 models 列表中找到匹配的复合 ID
    const sourceComposite = models.find(
      (model) => model.providerType === m.providerType && extractModelName(model.id) === m.sourceModel
    )?.id ?? m.sourceModel
    const targetComposite = models.find(
      (model) => model.providerType === m.providerType && extractModelName(model.id) === m.targetModel
    )?.id ?? m.targetModel
    setForm({
      providerType: m.providerType,
      sourceModel: sourceComposite,
      targetModel: targetComposite,
    })
    setModalOpen(true)
  }

  /** 提交表单：从复合 ID 中提取纯模型名后调用 IPC */
  const handleSave = async () => {
    if (!form.sourceModel || !form.targetModel) return

    const sourceModel = extractModelName(form.sourceModel)
    const targetModel = extractModelName(form.targetModel)

    // 前置校验：源模型与目标模型不能相同
    if (sourceModel === targetModel) {
      toast.error('源模型和目标模型不能相同')
      return
    }

    setSaving(true)
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({
          id: editingId,
          providerType: form.providerType,
          sourceModel,
          targetModel,
        })
        toast.success('映射已更新')
      } else {
        await createMutation.mutateAsync({
          providerType: form.providerType,
          sourceModel,
          targetModel,
        })
        toast.success('映射已创建')
      }
      setModalOpen(false)
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      // 处理 UNIQUE 约束冲突
      if (raw.includes('UNIQUE')) {
        toast.error('该 Provider Type 下已存在相同的源模型映射')
      } else {
        toast.error(`保存失败: ${raw}`)
      }
    } finally {
      setSaving(false)
    }
  }

  /** 删除映射 */
  const handleDelete = async (m: ModelMapping) => {
    try {
      await deleteMutation.mutateAsync(m.id)
      toast.success('映射已删除')
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">模型映射</h1>
          <p className="text-sm mt-1 text-muted-foreground">配置模型名称转换规则，将请求中的模型名映射到实际模型</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" />
          新增映射
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      ) : mappings.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="text-3xl mb-3 opacity-40">&#128260;</div>
          <p className="text-base font-medium mb-1 text-muted-foreground">暂无映射</p>
          <p className="text-sm text-muted-foreground/60">点击上方「新增映射」开始配置模型名称转换规则</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider Type</TableHead>
                <TableHead>源模型</TableHead>
                <TableHead>目标模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m, idx) => (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <TableCell>
                    <Badge variant="secondary">{m.providerType}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm font-mono text-foreground">{m.sourceModel}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm font-mono text-foreground">{m.targetModel}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'gap-1.5',
                        m.isActive === 1
                          ? 'border-green-500/30 text-green-500'
                          : 'border-muted-foreground/30 text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          m.isActive === 1 ? 'bg-green-500' : 'bg-muted-foreground'
                        )}
                      />
                      {m.isActive === 1 ? '启用' : '禁用'}
                    </Badge>
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
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">Provider Type</label>
              <Select
                value={form.providerType}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, providerType: value, sourceModel: '', targetModel: '' }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Provider 类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">源模型</label>
              <Select
                value={form.sourceModel}
                onValueChange={(value) => setForm((prev) => ({ ...prev, sourceModel: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={filteredModels.length === 0 ? '该类型下无可用模型' : '选择源模型'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredModels.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      请先配置对应类型的供应商
                    </SelectItem>
                  ) : (
                    filteredModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">目标模型</label>
              <Select
                value={form.targetModel}
                onValueChange={(value) => setForm((prev) => ({ ...prev, targetModel: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={filteredModels.length === 0 ? '该类型下无可用模型' : '选择目标模型'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredModels.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      请先配置对应类型的供应商
                    </SelectItem>
                  ) : (
                    filteredModels.map((m) => (
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
