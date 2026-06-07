/**
 * ProviderFormDialog — 供应商创建/编辑弹窗
 *
 * 包含名称、供应商类型、Base URL、API Key、模型列表五个字段。
 * 模型列表通过输入框 + Enter 或「添加」按钮逐步构建。
 * 切换供应商类型时自动填充默认 Base URL。
 *
 * @param open - 弹窗是否打开
 * @param onOpenChange - 弹窗开关状态变更回调
 * @param editingId - 编辑模式下的供应商 ID，null 表示新建
 * @param onSaved - 保存成功后的回调
 */

import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateProvider, useUpdateProvider } from '@/lib/queries/providers'
import { cn, getErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export interface ProviderForm {
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

interface ProviderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingId: number | null
  initialForm?: ProviderForm
  onSaved: () => void
}

/** 供应商创建/编辑弹窗，包含名称、类型、Base URL、API Key、模型列表字段。 @returns 供应商表单弹窗 JSX。 */
export function ProviderFormDialog({
  open,
  onOpenChange,
  editingId,
  initialForm,
  onSaved,
}: ProviderFormDialogProps) {
  const createMutation = useCreateProvider()
  const updateMutation = useUpdateProvider()

  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newModel, setNewModel] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialForm ?? emptyForm)
      setNewModel('')
      setShowApiKey(false)
    }
  }, [open, initialForm])

  const handleProviderTypeChange = (newType: 'anthropic' | 'openai') => {
    setForm((prev) => ({
      ...prev,
      providerType: newType,
      baseUrl: defaultBaseUrls[newType] ?? prev.baseUrl,
    }))
  }

  const handleAddModel = () => {
    const trimmed = newModel.trim()
    if (!trimmed || form.models.includes(trimmed)) return
    setForm((prev) => ({ ...prev, models: [...prev.models, trimmed] }))
    setNewModel('')
  }

  const handleRemoveModel = (index: number) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
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
      onOpenChange(false)
      onSaved()
      toast.success(editingId !== null ? '供应商已更新' : '供应商已创建')
    } catch (e) {
      const raw = getErrorMessage(e)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingId !== null ? '编辑供应商' : '添加供应商'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="mb-1.5 text-muted-foreground">名称</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如: OpenAI 主账号"
            />
          </div>

          <div>
            <Label className="mb-1.5 text-muted-foreground">供应商类型</Label>
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
            <Label className="mb-1.5 text-muted-foreground">Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div>
            <Label className="mb-1.5 text-muted-foreground">API Key</Label>
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
            <Label className="mb-1.5 text-muted-foreground">模型列表</Label>
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
                    onClick={() => handleRemoveModel(i)}
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
                    handleAddModel()
                  }
                }}
                placeholder="输入模型名称后按 Enter 添加"
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!newModel.trim()}
                onClick={handleAddModel}
              >
                添加
              </Button>
            </div>
            <p className="text-xs mt-1 text-muted-foreground/60">按 Enter 快速添加模型</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || form.models.length === 0}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
