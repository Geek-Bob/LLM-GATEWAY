import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Eye, EyeOff, Copy, Check, Key } from 'lucide-react'
import { toast } from 'sonner'
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '../lib/queries/apiKeys'
import type { ApiKey } from '../lib/types'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../components/ui/popover'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'

type Step = 'form' | 'result'

export function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys()
  const createMutation = useCreateApiKey()
  const deleteMutation = useDeleteApiKey()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [rateLimit, setRateLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [plaintextKey, setPlaintextKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [revealedKeyId, setRevealedKeyId] = useState<number | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)

  const openCreate = () => {
    setName('')
    setRateLimit('')
    setStep('form')
    setPlaintextKey('')
    setCopied(false)
    setDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const rl = rateLimit.trim() ? Number(rateLimit.trim()) : undefined
    if (rl !== undefined && (isNaN(rl) || rl < 1)) {
      toast.error('速率限制必须是大于 0 的数字')
      return
    }
    setSaving(true)
    try {
      const result = await createMutation.mutateAsync({ name: name.trim(), rateLimit: rl })
      setPlaintextKey(result.plaintextKey)
      setStep('result')
    } catch (e) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyCreatedKey = () => {
    navigator.clipboard.writeText(plaintextKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDelete = async (key: ApiKey) => {
    if (!window.confirm(`确认删除 API Key「${key.name}」？此操作不可撤销。`)) return
    try {
      await deleteMutation.mutateAsync(key.id)
      toast.success(`API Key「${key.name}」已删除`)
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const formatRateLimit = (rl: number) => `${rl}/min`

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            API Key 管理
          </h1>
          <p className="text-sm mt-1 text-muted-foreground">
            管理网关访问密钥
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" />
          创建 API Key
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
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Key className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-base font-medium mb-1 text-muted-foreground">
            暂无 API Key
          </p>
          <p className="text-sm text-muted-foreground/60">
            点击上方「创建 API Key」生成一个新的密钥
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>速率限制</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key, idx) => (
                <motion.tr
                  key={key.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <TableCell>
                    <span className="font-medium text-foreground">
                      {key.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">
                        {key.key_prefix}...
                      </span>
                      <Popover
                        open={revealedKeyId === key.id}
                        onOpenChange={(open) => {
                          if (!open) {
                            setRevealedKeyId(null)
                            setCopiedKeyId(null)
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() =>
                              setRevealedKeyId(
                                revealedKeyId === key.id ? null : key.id
                              )
                            }
                            title="查看完整 Key"
                          >
                            {revealedKeyId === key.id ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                          <div className="flex items-start gap-2">
                            <code className="text-xs font-mono break-all select-all text-primary flex-1 leading-relaxed">
                              {key.key_plaintext}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground"
                              onClick={() => {
                                navigator.clipboard.writeText(key.key_plaintext)
                                setCopiedKeyId(key.id)
                                setTimeout(() => setCopiedKeyId(null), 2000)
                              }}
                            >
                              {copiedKeyId === key.id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRateLimit(key.rate_limit)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'gap-1.5',
                        key.is_active === 1
                          ? 'border-green-500/30 text-green-500'
                          : 'border-muted-foreground/30 text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          key.is_active === 1
                            ? 'bg-green-500'
                            : 'bg-muted-foreground'
                        )}
                      />
                      {key.is_active === 1 ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(key.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog (two-step: form -> show created key) */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            // Reset form state when dialog closes
            setName('')
            setRateLimit('')
            setStep('form')
            setPlaintextKey('')
            setCopied(false)
          }
        }}
      >
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
                  <label className="block text-sm font-medium mb-1.5 text-muted-foreground">
                    名称
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如: 开发环境密钥"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-muted-foreground">
                    速率限制（次/分钟）
                  </label>
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
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
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
                  <label className="block text-sm font-medium mb-1.5 text-muted-foreground">
                    密钥
                  </label>
                  <div className="rounded-md border border-input bg-muted/30 px-3 py-3 select-all">
                    <code className="text-sm font-mono text-primary">
                      {plaintextKey}
                    </code>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  关闭
                </Button>
                <Button
                  onClick={handleCopyCreatedKey}
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
    </motion.div>
  )
}
