/**
 * Providers 页面 — AI 供应商 CRUD 管理
 *
 * 数据流:
 * 1. useProviders 通过 IPC 获取所有供应商列表
 * 2. useCreateProvider / useUpdateProvider / useDeleteProvider 处理增删改
 * 3. 弹出 Dialog 中编辑名称/类型/Base URL/API Key/模型列表
 * 4. 切换供应商类型时自动填充默认 Base URL
 * 5. 表格行支持查看/复制 API Key（Popover 展示）
 *
 * 模型列表通过输入框 + Enter 或「添加」按钮逐步构建
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { rowFadeIn } from '@/lib/animations'
import { Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider } from '@/lib/queries/providers'
import type { Provider } from '@/lib/types'
import { cn, getErrorMessage } from '@/lib/utils'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface ProviderForm {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

const emptyForm: ProviderForm = {
  name: '',
  providerType: 'openai',
  baseUrl: '',
  apiKey: '',
  models: [],
}

const defaultBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

export function ProvidersPage() {
  const { data: providers = [], isLoading } = useProviders()
  const createMutation = useCreateProvider()
  const updateMutation = useUpdateProvider()
  const deleteMutation = useDeleteProvider()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [revealedKeyId, setRevealedKeyId] = useState<number | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  const [newModel, setNewModel] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setNewModel('')
    setShowApiKey(false)
    setModalOpen(true)
  }

  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      models: [...p.models],
    })
    setNewModel('')
    setShowApiKey(false)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    // 前置校验：至少添加一个模型（避免 Zod 英文错误信息直接暴露给用户）
    if (form.models.length === 0) {
      toast.error('请至少添加一个模型')
      return
    }
    setSaving(true)
    try {
      if (editingId !== null) {
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          models: form.models,
        }
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim()
        await updateMutation.mutateAsync({ id: editingId, data: payload })
      } else {
        await createMutation.mutateAsync({
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
        })
      }
      setModalOpen(false)
      toast.success(editingId !== null ? '供应商已更新' : '供应商已创建')
    } catch (e) {
      const raw = getErrorMessage(e)
      // 解析 Zod 序列化错误，提取字段名和错误类型做中文映射
      const fieldMatch = raw.match(/"path":\s*\["(\w+)"\]/)
      const field = fieldMatch?.[1]
      const fieldNames: Record<string, string> = {
        name: '名称', providerType: '供应商类型', baseUrl: 'Base URL',
        apiKey: 'API Key', models: '模型列表',
      }
      if (field && fieldNames[field]) {
        toast.error(`保存失败: ${fieldNames[field]} 格式不正确`)
      } else {
        toast.error(`保存失败: ${raw}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const { execute: deleteProvider } = useDeleteWithToast(deleteMutation, '供应商')
  const handleDelete = (p: Provider) => deleteProvider(p.id, p.name)

  const handleProviderTypeChange = (newType: 'anthropic' | 'openai') => {
    setForm((prev) => ({
      ...prev,
      providerType: newType,
      baseUrl: defaultBaseUrls[newType] ?? prev.baseUrl,
    }))
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <PageHeader
        title="供应商管理"
        description="管理 AI 服务提供商连接"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            添加供应商
          </Button>
        }
      />

      {/* Content */}
      {isLoading ? (
        <TableSkeleton />
      ) : providers.length === 0 ? (
        <EmptyState icon="&#127970;" title="暂无供应商" description="点击上方「添加供应商」开始配置" />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>模型数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p, idx) => (
                <motion.tr key={p.id} {...rowFadeIn(idx)} className="border-b transition-colors hover:bg-muted/50">
                  <TableCell>
                    <span className="font-medium text-foreground">{p.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.providerType}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.models.length}</TableCell>
                  <TableCell>
                    <StatusBadge active={p.isActive === 1} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" className="text-primary" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(p)}>
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
              {editingId !== null ? '编辑供应商' : '添加供应商'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">名称</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如: OpenAI 主账号"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">供应商类型</label>
              <div className="flex gap-2">
                {(['openai', 'anthropic'] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    className={cn(
                      'flex-1',
                      form.providerType === type &&
                        'border-primary/30 bg-primary/10 text-primary'
                    )}
                    onClick={() => handleProviderTypeChange(type)}
                  >
                    {type === 'openai' ? 'OpenAI' : 'Anthropic'}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">Base URL</label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">API Key</label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.apiKey || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={editingId !== null ? '留空则不修改' : 'sk-...'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">模型列表</label>
              <div className="space-y-1.5 mb-2">
                {form.models.length === 0 && (
                  <p className="text-xs text-destructive">请至少添加一个模型</p>
                )}
                {form.models.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border bg-muted/30"
                  >
                    <span className="font-mono flex-1 text-foreground">{m}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          models: prev.models.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newModel.trim()) {
                      e.preventDefault()
                      const trimmed = newModel.trim()
                      if (form.models.includes(trimmed)) return
                      setForm((prev) => ({ ...prev, models: [...prev.models, trimmed] }))
                      setNewModel('')
                    }
                  }}
                  placeholder="输入模型名称后按 Enter 添加"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!newModel.trim()}
                  onClick={() => {
                    if (newModel.trim()) {
                      const trimmed = newModel.trim()
                      if (form.models.includes(trimmed)) return
                      setForm((prev) => ({ ...prev, models: [...prev.models, trimmed] }))
                      setNewModel('')
                    }
                  }}
                >
                  添加
                </Button>
              </div>
              <p className="text-xs mt-1 text-muted-foreground/60">按 Enter 快速添加模型</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || form.models.length === 0}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
