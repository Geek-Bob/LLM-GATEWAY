/**
 * ProviderFormDialog — 供应商创建/编辑弹窗
 *
 * 包含名称、供应商类型、Base URL、API Key、模型列表五个字段，
 * 以及模型列表下方的「费用配置（元/百万tokens）」区——每个模型一行 3 个单价输入
 * （缓存命中 / 缓存未命中 / 输出）。编辑模式打开时通过 usePricingByProvider 回填已有单价，
 * 保存时在 provider create/update 成功后对每个模型 upsert pricing（新建模式用返回的 provider id）。
 * 模型列表通过输入框 + Enter 或「添加」按钮逐步构建。
 * 切换供应商类型时自动填充默认 Base URL。
 *
 * @param open - 弹窗是否打开
 * @param onOpenChange - 弹窗开关状态变更回调
 * @param editingId - 编辑模式下的供应商 ID，null 表示新建
 * @param initialForm - 编辑模式下的初始表单数据（不含 pricing，pricing 由 usePricingByProvider 回填）
 * @param onSaved - 保存成功后的回调
 */

import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateProvider, useUpdateProvider } from '@/lib/queries/providers'
import { usePricingByProvider, useUpsertPricing } from '@/lib/queries/pricing'
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

/**
 * 单价行输入态。表单内部以 string 存储（便于受控 Input 清空/编辑），
 * 保存时再 parse 为 number 写入 PricingEntity（契约字段为 number）。
 */
export interface PricingRowInput {
  priceInCached: string
  priceInUncached: string
  priceOut: string
}

export interface ProviderForm {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

/**
 * 组件内部表单态：在公开 ProviderForm 基础上扩展 pricing（单价输入态）。
 * pricing 不进入公开 ProviderForm（保持对外契约向后兼容，调用方 Providers.tsx 无需感知），
 * 由本组件内部维护：新建模式为空，编辑模式由 usePricingByProvider 回填。
 */
interface ProviderFormState extends ProviderForm {
  pricing: Record<string, PricingRowInput>
}

const emptyPricingRow: PricingRowInput = {
  priceInCached: '',
  priceInUncached: '',
  priceOut: '',
}

const emptyForm: ProviderFormState = {
  name: '',
  providerType: 'openai',
  baseUrl: '',
  apiKey: '',
  models: [],
  pricing: {},
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
  const upsertPricing = useUpsertPricing()
  // 编辑模式拉取已有单价回填；新建模式（editingId=null）传 0（不存在的 id，返回空），
  // 避免条件 hook 调用。回填逻辑由下方 effect 守卫 editingId !== null。
  const pricingQuery = usePricingByProvider(editingId ?? 0)

  const [form, setForm] = useState<ProviderFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newModel, setNewModel] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (open) {
      // initialForm 由调用方构造（不含 pricing），统一以空 pricing 起步，
      // 编辑模式下由下方 usePricingByProvider 回填 effect 填入。
      setForm({ ...(initialForm ?? emptyForm), pricing: {} })
      setNewModel('')
      setShowApiKey(false)
    }
  }, [open, initialForm])

  // 编辑模式：usePricingByProvider 数据到达后回填单价（number → string 便于受控输入编辑）
  useEffect(() => {
    if (editingId === null) return
    const data = pricingQuery.data
    if (!data || data.length === 0) return
    setForm((prev) => {
      const pricing: Record<string, PricingRowInput> = { ...prev.pricing }
      for (const p of data) {
        pricing[p.model] = {
          priceInCached: String(p.priceInCached),
          priceInUncached: String(p.priceInUncached),
          priceOut: String(p.priceOut),
        }
      }
      return { ...prev, pricing }
    })
  }, [pricingQuery.data, editingId])

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
    setForm((prev) => ({
      ...prev,
      models: [...prev.models, trimmed],
      // 新增模型同步加默认空单价行
      pricing: { ...prev.pricing, [trimmed]: { ...emptyPricingRow } },
    }))
    setNewModel('')
  }

  const handleRemoveModel = (index: number) => {
    setForm((prev) => {
      const removedModel = prev.models[index]
      // 移除模型同步移除其单价行
      const restPricing = Object.fromEntries(
        Object.entries(prev.pricing).filter(([k]) => k !== removedModel),
      )
      return {
        ...prev,
        models: prev.models.filter((_, i) => i !== index),
        pricing: restPricing,
      }
    })
  }

  const handlePricingChange = (
    model: string,
    field: keyof PricingRowInput,
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        [model]: { ...(prev.pricing[model] ?? emptyPricingRow), [field]: value },
      },
    }))
  }

  /** 将字符串单价解析为数字（空串/非法值归 0，与缺单价归 0 的费用计算口径一致）。 */
  const parsePrice = (value: string): number => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    if (form.models.length === 0) {
      toast.error('请至少添加一个模型')
      return
    }
    setSaving(true)
    try {
      // 1) 保存供应商；新建模式拿到返回的 provider id 用于后续 pricing upsert
      let providerId: number
      if (editingId !== null) {
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          models: form.models,
        }
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim()
        await updateMutation.mutateAsync({ id: editingId, data: payload })
        providerId = editingId
      } else {
        providerId = await createMutation.mutateAsync({
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
        })
      }

      // 2) 对每个模型 upsert pricing（新建模式用返回的 provider id；
      //    若 create 失败会抛出，不会执行到此处，upsert 不被调用）
      for (const model of form.models) {
        const row = form.pricing[model] ?? emptyPricingRow
        await upsertPricing.mutateAsync({
          providerId,
          model,
          priceInCached: parsePrice(row.priceInCached),
          priceInUncached: parsePrice(row.priceInUncached),
          priceOut: parsePrice(row.priceOut),
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
                    aria-label="移除模型"
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

          {/* 费用配置区：仅对已添加模型渲染，每模型一行 3 个单价输入 */}
          <div>
            <Label className="mb-1.5 text-muted-foreground">费用配置（元/百万tokens）</Label>
            {form.models.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-2 text-xs text-muted-foreground/80">
                  <span>模型</span>
                  <span>缓存命中</span>
                  <span>缓存未命中</span>
                  <span>输出</span>
                </div>
                {form.models.map((m) => {
                  const row = form.pricing[m] ?? emptyPricingRow
                  return (
                    <div
                      key={m}
                      className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-2 items-center"
                    >
                      <span className="font-mono text-xs text-foreground truncate" title={m}>{m}</span>
                      <Input
                        inputMode="decimal"
                        placeholder="缓存命中"
                        value={row.priceInCached}
                        onChange={(e) => handlePricingChange(m, 'priceInCached', e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        inputMode="decimal"
                        placeholder="缓存未命中"
                        value={row.priceInUncached}
                        onChange={(e) => handlePricingChange(m, 'priceInUncached', e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        inputMode="decimal"
                        placeholder="输出"
                        value={row.priceOut}
                        onChange={(e) => handlePricingChange(m, 'priceOut', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {form.models.length === 0 && (
              <p className="text-xs text-muted-foreground/60">添加模型后可配置单价</p>
            )}
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
