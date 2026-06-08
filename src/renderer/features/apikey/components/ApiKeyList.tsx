/**
 * ApiKeyList — API Key 列表表格组件
 *
 * 展示密钥名称、前缀、速率限制、状态、创建时间，并提供查看完整密钥（Popover）和删除操作。
 * 查看完整密钥的 Popover 状态由组件内部管理。
 *
 * @param keys - API Key 列表数据
 * @param onDelete - 删除回调，接收要删除的 ApiKey 对象
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { rowFadeIn } from '@/lib/animations'
import type { ApiKey } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { useClipboard } from '@/hooks/useClipboard'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
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

/** 速率限制格式化：数字 → "N/min" */
const formatRateLimit = (rl: number) => `${rl}/min`

interface ApiKeyListProps {
  /** API Key 列表 */
  keys: ApiKey[]
  /** 删除回调 */
  onDelete: (key: ApiKey) => void
}

/** API Key 列表表格组件，展示密钥名称、前缀、速率限制和操作按钮。 @returns API Key 列表 JSX。 */
export function ApiKeyList({ keys, onDelete }: ApiKeyListProps) {
  const [revealedKeyId, setRevealedKeyId] = useState<number | null>(null)
  const { copied, copy } = useClipboard()

  return (
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
            <motion.tr key={key.id} {...rowFadeIn(idx)} className="border-b transition-colors hover:bg-muted/50">
              <TableCell>
                <span className="font-medium text-foreground">
                  {key.name}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {key.keyPrefix}...
                  </span>
                  <Popover
                    open={revealedKeyId === key.id}
                    onOpenChange={(open) => {
                      if (!open) setRevealedKeyId(null)
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() =>
                          setRevealedKeyId(revealedKeyId === key.id ? null : key.id)
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
                          {key.keyPlaintext}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() => copy(key.keyPlaintext)}
                        >
                          {copied ? (
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
                {formatRateLimit(key.rateLimit)}
              </TableCell>
              <TableCell>
                <StatusBadge isActive={key.isActive === 1} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(key.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(key)}
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
  )
}
