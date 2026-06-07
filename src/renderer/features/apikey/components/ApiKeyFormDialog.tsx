/**
 * ApiKeyFormDialog — 创建 API Key 的两步对话框
 *
 * Step 1 (form): 填写名称和可选的速率限制
 * Step 2 (result): 展示生成的明文密钥（仅此一次），支持一键复制
 *
 * 表单状态（name、rateLimit、step、plaintextKey）由组件内部管理，
 * 外部只需控制 open 状态和提供 createKey 异步函数。
 *
 * @param open - 对话框是否打开
 * @param onOpenChange - 对话框开关状态变更回调
 * @param createKey - 创建 API Key 的异步函数，返回含 plaintextKey 的结果
 * @param onCreated - 创建成功后的回调（用于刷新列表等）
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'
import { useClipboard } from '@/hooks/useClipboard'
import { useSavingAction } from '@/hooks/useSavingAction'
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

type Step = 'form' | 'result'

interface ApiKeyFormDialogProps {
  /** 对话框是否打开 */
  open: boolean
  /** 对话框开关状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 创建 API Key 的异步函数 */
  createKey: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string }>
  /** 创建成功后的回调 */
  onCreated?: () => void
}

/** 创建 API Key 的两步对话框，填写信息后展示生成的明文密钥。 @returns API Key 表单弹窗 JSX。 */
export function ApiKeyFormDialog({
  open,
  onOpenChange,
  createKey,
  onCreated,
}: ApiKeyFormDialogProps) {
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [rateLimit, setRateLimit] = useState('')
  const [plaintextKey, setPlaintextKey] = useState('')
  const { saving, execute: executeSaving } = useSavingAction()
  const { copied, copy } = useClipboard()

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setName('')
      setRateLimit('')
      setStep('form')
      setPlaintextKey('')
    }
  }

  const handleCreate = () => {
    if (!name.trim()) return
    const rl = rateLimit.trim() ? Number(rateLimit.trim()) : undefined
    if (rl !== undefined && (isNaN(rl) || rl < 1)) {
      toast.error('速率限制必须是大于 0 的数字')
      return
    }
    executeSaving(async () => {
      const result = await createKey(name.trim(), rl)
      setPlaintextKey(result.plaintextKey)
      setStep('result')
      onCreated?.()
    }, '创建失败')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'form' ? '创建 API Key' : 'API Key 已创建'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Form */}
        {step === 'form' && (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-1.5 text-muted-foreground">
                  名称
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 开发环境密钥"
                />
              </div>
              <div>
                <Label className="mb-1.5 text-muted-foreground">
                  速率限制（次/分钟）
                </Label>
                <Input
                  type="number"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  placeholder="默认 60"
                  min={1}
                />
                <p className="text-xs mt-1 text-muted-foreground/60">
                  留空则使用默认值（60 次/分钟）
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !name.trim()}
              >
                {saving ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Show created key */}
        {step === 'result' && (
          <>
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <Check className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
                <p className="text-sm text-green-500">
                  密钥已创建成功。后续可在列表中点按眼睛图标查看。
                </p>
              </div>
              <div>
                <Label className="mb-1.5 text-muted-foreground">
                  密钥
                </Label>
                <div className="rounded-md border border-input bg-muted/30 px-3 py-3 select-all">
                  <code className="text-sm font-mono text-primary">
                    {plaintextKey}
                  </code>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                关闭
              </Button>
              <Button
                onClick={() => copy(plaintextKey)}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    复制
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
